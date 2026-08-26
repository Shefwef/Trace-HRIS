import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@/lib/db';
import { requireAuth, err, type ApiUser } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { resolveVisibleEmployeeIds } from '@/lib/workLocation';
import { AttendanceReport, type AttendanceRecord } from '@/lib/reports/AttendanceReport';
import { LeavesReport, type LeaveRecord } from '@/lib/reports/LeavesReport';
import { SummaryReport } from '@/lib/reports/SummaryReport';
import { AllEmployeesReport, type EmployeeRow } from '@/lib/reports/AllEmployeesReport';
import {
  getAttendanceReportData, getCompanyReportData, getLeaveReportData,
  getOffsiteRows, getSummaryReportData, monthPeriod, yearPeriod,
} from '@/lib/reports/data';
import {
  buildAttendanceWorkbook, buildCompanyWorkbook, buildLeavesWorkbook,
  buildOffsiteWorkbook, buildSummaryWorkbook,
} from '@/lib/reports/builders';
import { xlsxResponse } from '@/lib/reports/workbook';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Reads the Trace logo from the public folder and returns a base64 data URL
 * that @react-pdf/renderer can embed inline. Cached at module scope.
 */
let cachedLogo: string | null = null;
async function getLogoDataUrl(): Promise<string> {
  if (cachedLogo) return cachedLogo;
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'Trace Consulting Logo.png'));
    cachedLogo = `data:image/png;base64,${buf.toString('base64')}`;
    return cachedLogo;
  } catch {
    return '';
  }
}

function fmtGeneratedAt(): string {
  return new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function pdfResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

/**
 * GET /api/reports/attendance?year=YYYY&month=MM
 * GET /api/reports/leaves?year=YYYY
 * GET /api/reports/summary?year=YYYY&month=MM
 * GET /api/reports/all-employees?year=YYYY&month=MM   (reports.company)
 * GET /api/reports/offsite?year=YYYY&month=MM         (work_location.view_all/_team)
 *
 * `?format=xlsx` (the default) returns a formatted workbook; `?format=pdf`
 * returns the print-ready PDF. Excel leads because these reports get filtered,
 * pivoted and pasted into payroll sheets — a PDF is the exception, not the norm.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ type: string }> },
): Promise<Response> {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const { type } = await ctx.params;
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get('year') ?? now.getFullYear());
  const month = Number(url.searchParams.get('month') ?? now.getMonth() + 1);
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx';

  if (!Number.isFinite(year) || year < 2000 || year > 2100)
    return err(400, 'BAD_YEAR', 'Invalid year.');
  const usesMonth = type === 'attendance' || type === 'summary'
    || type === 'all-employees' || type === 'offsite';
  if (usesMonth) {
    if (!Number.isFinite(month) || month < 1 || month > 12)
      return err(400, 'BAD_MONTH', 'Invalid month.');
  }

  try {
    if (format === 'xlsx') return await renderXlsx(user, type, year, month);

    const logoDataUrl = await getLogoDataUrl();
    const generatedAt = fmtGeneratedAt();
    switch (type) {
      case 'attendance':
        return await renderAttendance(user, year, month, logoDataUrl, generatedAt);
      case 'leaves':
        return await renderLeaves(user, year, logoDataUrl, generatedAt);
      case 'summary':
        return await renderSummary(user, year, month, logoDataUrl, generatedAt);
      case 'all-employees':
        // Reads the runtime permission matrix rather than the denormalised
        // primary role: a COO holding ADMIN + EMPLOYEE has EMPLOYEE nowhere in
        // sight but every right to this report, and a Line Manager whose
        // reports.company key was toggled on would otherwise be refused.
        if (!(await checkPermission(user, 'reports.company')))
          return err(403, 'FORBIDDEN', 'You do not have permission to export company reports.');
        return await renderAllEmployees(year, month, logoDataUrl, generatedAt);
      case 'offsite':
        return err(
          400, 'PDF_UNAVAILABLE',
          'The off-site work report is Excel-only — 14 columns of coordinates do not fit a page.',
        );
      default:
        return err(404, 'UNKNOWN_REPORT', `Unknown report type "${type}".`);
    }
  } catch (e) {
    console.error('[reports] render error', e);
    return NextResponse.json(
      { error: 'RENDER_FAILED', message: `Could not generate the ${format.toUpperCase()}.` },
      { status: 500 },
    );
  }
}

// ─── Excel ─────────────────────────────────────────────────

/**
 * The Excel path. Each report resolves its own scope: the three personal
 * reports are always the caller's own data, and the two team-wide ones go
 * through the permission matrix. No branch here reads an employee id from the
 * query string, so there is nothing for a caller to tamper with.
 */
async function renderXlsx(
  user: ApiUser,
  type: string,
  year: number,
  month: number,
): Promise<Response> {
  const slug = (user.employeeIdCode ?? user.fullName).replace(/\s+/g, '-').toLowerCase();

  switch (type) {
    case 'attendance': {
      const period = monthPeriod(year, month);
      const data = await getAttendanceReportData(user, period);
      return xlsxResponse(
        buildAttendanceWorkbook(user, period, data),
        `attendance-report-${slug}-${period.fileRange}.xlsx`,
      );
    }

    case 'leaves': {
      const period = yearPeriod(year);
      const data = await getLeaveReportData(user, year);
      return xlsxResponse(
        buildLeavesWorkbook(user, period, data),
        `leave-history-${slug}-${period.fileRange}.xlsx`,
      );
    }

    case 'summary': {
      const period = monthPeriod(year, month);
      const data = await getSummaryReportData(user, period);
      return xlsxResponse(
        buildSummaryWorkbook(user, period, data),
        `performance-summary-${slug}-${period.fileRange}.xlsx`,
      );
    }

    case 'all-employees': {
      if (!(await checkPermission(user, 'reports.company')))
        return err(403, 'FORBIDDEN', 'You do not have permission to export company reports.');
      const period = monthPeriod(year, month);
      const data = await getCompanyReportData(period, 'ALL');
      return xlsxResponse(
        buildCompanyWorkbook(period, data, 'All active employees'),
        `company-report-${period.fileRange}.xlsx`,
      );
    }

    case 'offsite': {
      // Same scope resolution the location board uses: 'ALL' for HR/Admin, the
      // direct reports for a Line Manager, and own-rows-only for everyone else.
      const scope = await resolveVisibleEmployeeIds(user);
      const period = monthPeriod(year, month);
      const ids = scope === 'ALL' ? await allActiveIds() : (scope ?? [user.id]);
      const rows = await getOffsiteRows(ids, period);
      const label =
        scope === 'ALL' ? 'All active employees'
        : scope === null ? 'Your own records'
        : 'Your direct reports';
      return xlsxResponse(
        buildOffsiteWorkbook(period, rows, label),
        `offsite-work-report-${period.fileRange}.xlsx`,
      );
    }

    default:
      return err(404, 'UNKNOWN_REPORT', `Unknown report type "${type}".`);
  }
}

async function allActiveIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ─── attendance ────────────────────────────────────────────────

async function renderAttendance(
  user: { id: string; fullName: string; email: string; role: string; employeeIdCode: string | null },
  year: number,
  month: number,
  logoDataUrl: string,
  generatedAt: string,
): Promise<Response> {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const records = await prisma.attendanceRecord.findMany({
    where: { employeeId: user.id, date: { gte: from, lt: to } },
    orderBy: { date: 'asc' },
  });

  const shaped: AttendanceRecord[] = records.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    clockInTime: r.clockInTime?.toISOString() ?? null,
    clockOutTime: r.clockOutTime?.toISOString() ?? null,
    totalWorkedMinutes: r.totalWorkedMinutes,
    totalBreakMinutes: r.totalBreakMinutes,
    overtimeMinutes: r.overtimeMinutes,
    status: r.status,
  }));

  const buf = await renderToBuffer(
    AttendanceReport({
      employeeName: user.fullName,
      employeeEmail: user.email,
      employeeIdCode: user.employeeIdCode,
      role: user.role,
      year,
      month,
      records: shaped,
      logoDataUrl,
      generatedAt,
    }),
  );
  return pdfResponse(
    buf,
    `attendance_${user.fullName.replace(/\s+/g, '_')}_${year}-${String(month).padStart(2, '0')}.pdf`,
  );
}

// ─── leaves ────────────────────────────────────────────────

async function renderLeaves(
  user: { id: string; fullName: string; email: string; role: string; employeeIdCode: string | null },
  year: number,
  logoDataUrl: string,
  generatedAt: string,
): Promise<Response> {
  const [balance, requests] = await Promise.all([
    prisma.leaveBalance.upsert({
      where: { employeeId_cycleYear: { employeeId: user.id, cycleYear: year } },
      create: {
        employeeId: user.id,
        cycleYear: year,
        cycleStartDate: new Date(year, 0, 1),
        cycleEndDate: new Date(year, 11, 31),
      },
      update: {},
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: user.id,
        startDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
      },
      include: { reviewer: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const shaped: LeaveRecord[] = requests.map((r) => ({
    leaveType: r.leaveType,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    durationDays: Number(r.durationDays),
    isHalfDay: r.isHalfDay,
    halfDaySlot: r.halfDaySlot,
    timeFrom: r.timeFrom,
    timeTo: r.timeTo,
    reason: r.reason,
    status: r.status,
    adminNote: r.adminNote,
    reviewerName: r.reviewer?.fullName ?? null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  const buf = await renderToBuffer(
    LeavesReport({
      employeeName: user.fullName,
      employeeEmail: user.email,
      employeeIdCode: user.employeeIdCode,
      role: user.role,
      cycleYear: year,
      balance: {
        casualTotal: Number(balance.casualTotal),
        casualUsed: Number(balance.casualUsed),
        casualPending: Number(balance.casualPending),
        sickTotal: Number(balance.sickTotal),
        sickUsed: Number(balance.sickUsed),
        sickPending: Number(balance.sickPending),
        replacementBalance: Number(balance.replacementBalance),
      },
      records: shaped,
      logoDataUrl,
      generatedAt,
    }),
  );
  return pdfResponse(
    buf,
    `leaves_${user.fullName.replace(/\s+/g, '_')}_${year}.pdf`,
  );
}

// ─── summary ────────────────────────────────────────────────

async function renderSummary(
  user: { id: string; fullName: string; email: string; role: string; employeeIdCode: string | null; department: string | null; designation: string | null },
  year: number,
  month: number,
  logoDataUrl: string,
  generatedAt: string,
): Promise<Response> {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const [balance, records, requests] = await Promise.all([
    prisma.leaveBalance.upsert({
      where: { employeeId_cycleYear: { employeeId: user.id, cycleYear: year } },
      create: {
        employeeId: user.id,
        cycleYear: year,
        cycleStartDate: new Date(year, 0, 1),
        cycleEndDate: new Date(year, 11, 31),
      },
      update: {},
    }),
    prisma.attendanceRecord.findMany({
      where: { employeeId: user.id, date: { gte: from, lt: to } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: user.id,
        startDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
      },
    }),
  ]);

  const presentDays = records.filter((r) => r.status === 'PRESENT').length;
  const workDays = records.filter((r) => r.status !== 'WEEKEND' && r.status !== 'HOLIDAY').length;
  const workedMinutes = records.reduce((s, r) => s + r.totalWorkedMinutes, 0);
  const overtimeMinutes = records.reduce((s, r) => s + r.overtimeMinutes, 0);
  const absentDays = records.filter((r) => r.status === 'ABSENT').length;
  const approved = requests.filter((r) => r.status === 'APPROVED');
  const totalDaysUsed = approved.reduce((s, r) => s + Number(r.durationDays), 0);

  const buf = await renderToBuffer(
    SummaryReport({
      employeeName: user.fullName,
      employeeEmail: user.email,
      employeeIdCode: user.employeeIdCode,
      role: user.role,
      department: user.department,
      designation: user.designation,
      cycleYear: year,
      balance: {
        casualTotal: Number(balance.casualTotal),
        casualUsed: Number(balance.casualUsed),
        casualPending: Number(balance.casualPending),
        sickTotal: Number(balance.sickTotal),
        sickUsed: Number(balance.sickUsed),
        sickPending: Number(balance.sickPending),
        replacementBalance: Number(balance.replacementBalance),
      },
      attendance: {
        monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
        presentDays,
        workDays,
        workedMinutes,
        overtimeMinutes,
        absentDays,
      },
      leaves: {
        approved: approved.length,
        pending: requests.filter((r) => r.status === 'PENDING').length,
        rejected: requests.filter((r) => r.status === 'REJECTED').length,
        totalDaysUsed,
      },
      logoDataUrl,
      generatedAt,
    }),
  );
  return pdfResponse(
    buf,
    `summary_${user.fullName.replace(/\s+/g, '_')}_${year}.pdf`,
  );
}

// ─── all employees (admin) ────────────────────────────────────

async function renderAllEmployees(
  year: number,
  month: number,
  logoDataUrl: string,
  generatedAt: string,
): Promise<Response> {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const employees = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    include: {
      leaveBalances: { where: { cycleYear: year } },
      leaveRequests: {
        where: {
          startDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
        },
      },
      attendance: { where: { date: { gte: from, lt: to } } },
    },
  });

  const rows: EmployeeRow[] = employees.map((e) => {
    const bal = e.leaveBalances[0];
    const monthRecords = e.attendance;
    const present = monthRecords.filter((r) => r.status === 'PRESENT').length;
    const workDays = monthRecords.filter((r) => r.status !== 'WEEKEND' && r.status !== 'HOLIDAY').length;
    const overtimeMinutes = monthRecords.reduce((s, r) => s + r.overtimeMinutes, 0);
    return {
      name: e.fullName,
      email: e.email,
      role: e.role,
      department: e.department,
      casualUsed: bal ? Number(bal.casualUsed) : 0,
      casualTotal: bal ? Number(bal.casualTotal) : 12,
      sickUsed: bal ? Number(bal.sickUsed) : 0,
      sickTotal: bal ? Number(bal.sickTotal) : 12,
      replacementBalance: bal ? Number(bal.replacementBalance) : 0,
      approvedLeaves: e.leaveRequests.filter((r) => r.status === 'APPROVED').length,
      pendingLeaves: e.leaveRequests.filter((r) => r.status === 'PENDING').length,
      attendanceRate: workDays === 0 ? null : Math.round((present / workDays) * 100),
      overtimeMinutes,
    };
  });

  const totalActiveLeaves = rows.reduce((s, r) => s + r.approvedLeaves, 0);
  const totalPendingRequests = rows.reduce((s, r) => s + r.pendingLeaves, 0);

  const buf = await renderToBuffer(
    AllEmployeesReport({
      cycleYear: year,
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      totalEmployees: rows.length,
      totalActiveLeaves,
      totalPendingRequests,
      rows,
      logoDataUrl,
      generatedAt,
    }),
  );
  return pdfResponse(buf, `trace_hris_all_employees_${year}.pdf`);
}
