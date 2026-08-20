import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { AttendanceReport, type AttendanceRecord } from '@/lib/reports/AttendanceReport';
import { LeavesReport, type LeaveRecord } from '@/lib/reports/LeavesReport';
import { SummaryReport } from '@/lib/reports/SummaryReport';
import { AllEmployeesReport, type EmployeeRow } from '@/lib/reports/AllEmployeesReport';

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
 * GET /api/reports/all-employees?year=YYYY&month=MM   (HR/Admin/Super Admin only)
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

  if (!Number.isFinite(year) || year < 2000 || year > 2100)
    return err(400, 'BAD_YEAR', 'Invalid year.');
  if (type === 'attendance' || type === 'summary' || type === 'all-employees') {
    if (!Number.isFinite(month) || month < 1 || month > 12)
      return err(400, 'BAD_MONTH', 'Invalid month.');
  }

  const logoDataUrl = await getLogoDataUrl();
  const generatedAt = fmtGeneratedAt();

  try {
    switch (type) {
      case 'attendance':
        return await renderAttendance(user, year, month, logoDataUrl, generatedAt);
      case 'leaves':
        return await renderLeaves(user, year, logoDataUrl, generatedAt);
      case 'summary':
        return await renderSummary(user, year, month, logoDataUrl, generatedAt);
      case 'all-employees':
        if (user.role !== 'HR' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')
          return err(403, 'FORBIDDEN', 'HR, Admin or Super Admin only.');
        return await renderAllEmployees(year, month, logoDataUrl, generatedAt);
      default:
        return err(404, 'UNKNOWN_REPORT', `Unknown report type "${type}".`);
    }
  } catch (e) {
    console.error('[reports] render error', e);
    return NextResponse.json(
      { error: 'RENDER_FAILED', message: 'Could not generate the PDF.' },
      { status: 500 },
    );
  }
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
