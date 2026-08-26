/**
 * Report data layer: every query and every derived figure the Excel reports
 * need. Deliberately free of ExcelJS — formatting lives in `workbook.ts`, so
 * a column reorder never touches a query and a query fix never touches a style.
 *
 * ## Dates in Excel
 *
 * ExcelJS converts a `Date` to an Excel serial with
 * `25569 + d.getTime() / 86400000` — pure UTC arithmetic. Handed a raw
 * `clockInTime`, Excel would display 08:58 Dhaka as 02:58, which is the same
 * UTC-vs-office bug that has bitten the calendar and the heatmap. Instant
 * columns therefore go through `excelInstant()`, which shifts by the office
 * offset so the serial's UTC components *are* the local wall clock.
 *
 * `@db.Date` columns need no shift: Prisma already stores them as UTC midnight
 * carrying the office-local Y/M/D, which is exactly what Excel should show.
 */
import type { AttendanceStatus, LeaveStatus, Role, WorkLocationType } from '@prisma/client';
import { prisma } from '../db';
import { dayLocationFacts, type DayLocationFacts as DayFacts } from '../workLocation';
import { APP_TZ, monthRange, tzOffsetMinutes } from '../workday';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── period ───────────────────────────────────────────────

/** The filter the user picked, resolved into query bounds and labels. */
export interface Period {
  year: number;
  /** Null for cycle-year reports, which cover all twelve months. */
  month: number | null;
  /** Inclusive lower bound for `@db.Date` comparisons. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  /** "August 2026" or "Cycle year 2026". */
  label: string;
  /** `2026-08-01-to-2026-08-31`, for the filename. */
  fileRange: string;
}

export function monthPeriod(year: number, month: number): Period {
  const { from, to } = monthRange(year, month);
  return {
    year,
    month,
    from,
    to,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    fileRange: `${dateOnlyKey(from)}-to-${dateOnlyKey(new Date(to.getTime() - 86_400_000))}`,
  };
}

export function yearPeriod(year: number): Period {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  return {
    year,
    month: null,
    from,
    to,
    label: `Cycle year ${year}`,
    fileRange: `${year}-01-01-to-${year}-12-31`,
  };
}

// ─── row shapes ───────────────────────────────────────────

/** §25 columns, plus the break/overtime fields the schema already tracks. */
export type DailyAttendanceRow = {
  employeeIdCode: string;
  employeeName: string;
  department: string;
  date: Date;
  weekday: string;
  clockIn: Date | null;
  clockOut: Date | null;
  workedHours: number;
  breakHours: number;
  overtimeHours: number;
  status: string;
  initialLocation: string;
  finalLocation: string;
  offsiteWork: string;
  offsiteHours: number;
}

/** §26 columns. One row per location period, corrections included. */
export type OffsiteEventRow = {
  employeeIdCode: string;
  employeeName: string;
  date: Date | null;
  event: string;
  placeName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  purpose: string;
  startedAt: Date;
  endedAt: Date | null;
  durationHours: number | null;
  changedBy: string;
  autoClosed: string;
}

export type LeaveRequestRow = {
  employeeIdCode: string;
  employeeName: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  halfDay: string;
  timeFrom: string;
  timeTo: string;
  reason: string;
  status: string;
  reviewer: string;
  reviewedAt: Date | null;
  appliedOn: Date;
  adminNote: string;
}

export type EmployeeSummaryRow = {
  employeeIdCode: string;
  employeeName: string;
  email: string;
  department: string;
  designation: string;
  role: string;
  lineManager: string;
  presentDays: number;
  workDays: number;
  /** A fraction (0.96), so Excel's percent format renders it as 96%. */
  attendanceRate: number | null;
  workedHours: number;
  overtimeHours: number;
  offsiteDays: number;
  offsiteHours: number;
  casualUsed: number;
  casualTotal: number;
  sickUsed: number;
  sickTotal: number;
  replacementBalance: number;
  approvedLeaves: number;
  pendingLeaves: number;
}

/** Headline figures for the sheet every workbook opens on. */
export interface AttendanceTotals {
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  workDays: number;
  attendanceRate: number | null;
  workedHours: number;
  breakHours: number;
  overtimeHours: number;
  offsiteDays: number;
  offsiteHours: number;
}

export interface Identity {
  id: string;
  fullName: string;
  email: string;
  role: string;
  employeeIdCode: string | null;
  department?: string | null;
  designation?: string | null;
}

// ─── attendance (one employee) ────────────────────────────

export interface AttendanceReportData {
  daily: DailyAttendanceRow[];
  offsite: OffsiteEventRow[];
  totals: AttendanceTotals;
}

export async function getAttendanceReportData(
  employee: Identity,
  period: Period,
): Promise<AttendanceReportData> {
  const [records, facts, offsite] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employeeId: employee.id, date: { gte: period.from, lt: period.to } },
      orderBy: { date: 'asc' },
    }),
    dayLocationFacts({ employeeIds: [employee.id], from: period.from, to: period.to }),
    getOffsiteRows([employee.id], period),
  ]);

  const daily = records.map((r) =>
    toDailyRow(r, {
      id: employee.id,
      employeeIdCode: employee.employeeIdCode,
      fullName: employee.fullName,
      department: employee.department ?? null,
    }, facts),
  );

  return { daily, offsite, totals: sumAttendance(daily) };
}

// ─── off-site work (scoped) ───────────────────────────────

/**
 * §26. `employeeIds` is resolved by the caller from
 * `resolveVisibleEmployeeIds` — this function trusts it as already authorised
 * and never widens the scope.
 *
 * Corrections are included: the point of an off-site report is to show what was
 * recorded *and* what HR had to fix, and dropping the ADMIN_CORRECTION rows
 * would hide the audit trail the append-only design exists to preserve.
 */
export async function getOffsiteRows(
  employeeIds: string[],
  period: Period,
): Promise<OffsiteEventRow[]> {
  if (employeeIds.length === 0) return [];
  const now = new Date();

  const events = await prisma.workLocationEvent.findMany({
    where: {
      employeeId: { in: employeeIds },
      // Off-site periods and the corrections that closed them. OFFICE_CLOCK_IN
      // baselines are noise here — every clocked-in day has one.
      OR: [
        { newLocationType: 'OFFSITE' },
        { eventType: 'ADMIN_CORRECTION' },
        { eventType: 'RETURNED_TO_OFFICE' },
      ],
      startedAt: { gte: shiftToInstant(period.from), lt: shiftToInstant(period.to) },
    },
    include: {
      employee: { select: { fullName: true, employeeIdCode: true } },
      createdBy: { select: { fullName: true } },
      attendance: { select: { date: true } },
    },
    orderBy: [{ startedAt: 'asc' }],
  });

  return events.map((e) => ({
    employeeIdCode: e.employee.employeeIdCode ?? '—',
    employeeName: e.employee.fullName,
    date: e.attendance ? excelDateOnly(e.attendance.date) : null,
    event: EVENT_LABEL[e.eventType],
    placeName: e.placeName ?? '',
    address: e.formattedAddress ?? '',
    latitude: e.latitude,
    longitude: e.longitude,
    purpose: e.purpose ?? '',
    startedAt: excelInstant(e.startedAt),
    endedAt: e.endedAt ? excelInstant(e.endedAt) : null,
    // An open period is measured to now, matching what the board shows.
    durationHours:
      e.eventType === 'ADMIN_CORRECTION'
        ? null
        : round2(((e.endedAt ?? now).getTime() - e.startedAt.getTime()) / 3_600_000),
    changedBy: e.createdBy.fullName,
    autoClosed: e.autoClosed ? 'Yes' : '',
  }));
}

// ─── leaves (one employee) ────────────────────────────────

export interface LeaveBalanceFigures {
  casualTotal: number;
  casualUsed: number;
  casualPending: number;
  sickTotal: number;
  sickUsed: number;
  sickPending: number;
  replacementBalance: number;
}

export interface LeaveReportData {
  balance: LeaveBalanceFigures;
  requests: LeaveRequestRow[];
  counts: { approved: number; pending: number; rejected: number; cancelled: number; daysUsed: number };
}

export async function getLeaveReportData(
  employee: Identity,
  year: number,
): Promise<LeaveReportData> {
  const [balance, requests] = await Promise.all([
    ensureBalance(employee.id, year),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      include: { reviewer: { select: { fullName: true } } },
      orderBy: { startDate: 'asc' },
    }),
  ]);

  const rows: LeaveRequestRow[] = requests.map((r) => ({
    employeeIdCode: employee.employeeIdCode ?? '—',
    employeeName: employee.fullName,
    leaveType: titleCase(r.leaveType),
    startDate: excelDateOnly(r.startDate),
    endDate: excelDateOnly(r.endDate),
    durationDays: Number(r.durationDays),
    halfDay: r.isHalfDay ? titleCase(r.halfDaySlot ?? 'Half day') : 'No',
    timeFrom: r.timeFrom ?? '',
    timeTo: r.timeTo ?? '',
    reason: r.reason,
    status: titleCase(r.status),
    reviewer: r.reviewer?.fullName ?? '',
    reviewedAt: r.reviewedAt ? excelInstant(r.reviewedAt) : null,
    appliedOn: excelInstant(r.createdAt),
    adminNote: r.adminNote ?? '',
  }));

  const by = (s: LeaveStatus) => requests.filter((r) => r.status === s);
  return {
    balance,
    requests: rows,
    counts: {
      approved: by('APPROVED').length,
      pending: by('PENDING').length,
      rejected: by('REJECTED').length,
      cancelled: by('CANCELLED').length,
      daysUsed: round2(by('APPROVED').reduce((s, r) => s + Number(r.durationDays), 0)),
    },
  };
}

// ─── company (every active employee) ──────────────────────

export interface CompanyReportData {
  employees: EmployeeSummaryRow[];
  daily: DailyAttendanceRow[];
  offsite: OffsiteEventRow[];
  leaves: LeaveRequestRow[];
  totals: {
    headcount: number;
    presentDays: number;
    workDays: number;
    attendanceRate: number | null;
    overtimeHours: number;
    offsiteHours: number;
    approvedLeaves: number;
    pendingLeaves: number;
  };
}

/**
 * The company workbook. `employeeIds` narrows the population — 'ALL' for
 * HR/Admin, an explicit list for a Line Manager's team. Resolved and authorised
 * by the caller.
 */
export async function getCompanyReportData(
  period: Period,
  employeeIds: 'ALL' | string[],
): Promise<CompanyReportData> {
  const employees = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(employeeIds === 'ALL' ? {} : { id: { in: employeeIds } }),
    },
    orderBy: [{ department: 'asc' }, { fullName: 'asc' }],
    include: {
      lineManager: { select: { fullName: true } },
      leaveBalances: { where: { cycleYear: period.year } },
      leaveRequests: {
        where: {
          startDate: {
            gte: new Date(Date.UTC(period.year, 0, 1)),
            lt: new Date(Date.UTC(period.year + 1, 0, 1)),
          },
        },
        include: { reviewer: { select: { fullName: true } } },
      },
      attendance: {
        where: { date: { gte: period.from, lt: period.to } },
        orderBy: { date: 'asc' },
      },
    },
  });

  const ids = employees.map((e) => e.id);
  const [facts, offsite] = await Promise.all([
    dayLocationFacts({ employeeIds: ids, from: period.from, to: period.to }),
    getOffsiteRows(ids, period),
  ]);

  const daily: DailyAttendanceRow[] = [];
  const leaves: LeaveRequestRow[] = [];
  const summaries: EmployeeSummaryRow[] = [];

  for (const e of employees) {
    const who = {
      id: e.id,
      employeeIdCode: e.employeeIdCode,
      fullName: e.fullName,
      department: e.department,
    };
    const rows = e.attendance.map((r) => toDailyRow(r, who, facts));
    daily.push(...rows);

    for (const r of e.leaveRequests) {
      leaves.push({
        employeeIdCode: e.employeeIdCode ?? '—',
        employeeName: e.fullName,
        leaveType: titleCase(r.leaveType),
        startDate: excelDateOnly(r.startDate),
        endDate: excelDateOnly(r.endDate),
        durationDays: Number(r.durationDays),
        halfDay: r.isHalfDay ? titleCase(r.halfDaySlot ?? 'Half day') : 'No',
        timeFrom: r.timeFrom ?? '',
        timeTo: r.timeTo ?? '',
        reason: r.reason,
        status: titleCase(r.status),
        reviewer: r.reviewer?.fullName ?? '',
        reviewedAt: r.reviewedAt ? excelInstant(r.reviewedAt) : null,
        appliedOn: excelInstant(r.createdAt),
        adminNote: r.adminNote ?? '',
      });
    }

    const t = sumAttendance(rows);
    const bal = e.leaveBalances[0];
    summaries.push({
      employeeIdCode: e.employeeIdCode ?? '—',
      employeeName: e.fullName,
      email: e.email,
      department: e.department ?? '',
      designation: e.designation ?? '',
      role: ROLE_LABEL[e.role] ?? titleCase(e.role),
      lineManager: e.lineManager?.fullName ?? '',
      presentDays: t.presentDays,
      workDays: t.workDays,
      attendanceRate: t.attendanceRate,
      workedHours: t.workedHours,
      overtimeHours: t.overtimeHours,
      offsiteDays: t.offsiteDays,
      offsiteHours: t.offsiteHours,
      casualUsed: bal ? Number(bal.casualUsed) : 0,
      casualTotal: bal ? Number(bal.casualTotal) : 12,
      sickUsed: bal ? Number(bal.sickUsed) : 0,
      sickTotal: bal ? Number(bal.sickTotal) : 12,
      replacementBalance: bal ? Number(bal.replacementBalance) : 0,
      approvedLeaves: e.leaveRequests.filter((r) => r.status === 'APPROVED').length,
      pendingLeaves: e.leaveRequests.filter((r) => r.status === 'PENDING').length,
    });
  }

  const presentDays = summaries.reduce((s, r) => s + r.presentDays, 0);
  const workDays = summaries.reduce((s, r) => s + r.workDays, 0);

  return {
    employees: summaries,
    daily,
    offsite,
    leaves,
    totals: {
      headcount: summaries.length,
      presentDays,
      workDays,
      attendanceRate: workDays === 0 ? null : round2(presentDays / workDays),
      overtimeHours: round2(summaries.reduce((s, r) => s + r.overtimeHours, 0)),
      offsiteHours: round2(summaries.reduce((s, r) => s + r.offsiteHours, 0)),
      approvedLeaves: summaries.reduce((s, r) => s + r.approvedLeaves, 0),
      pendingLeaves: summaries.reduce((s, r) => s + r.pendingLeaves, 0),
    },
  };
}

// ─── summary (one employee, one month) ────────────────────

export interface SummaryReportData {
  balance: LeaveBalanceFigures;
  attendance: AttendanceTotals;
  leaves: { approved: number; pending: number; rejected: number; daysUsed: number };
}

export async function getSummaryReportData(
  employee: Identity,
  period: Period,
): Promise<SummaryReportData> {
  const [balance, attendance, requests] = await Promise.all([
    ensureBalance(employee.id, period.year),
    getAttendanceReportData(employee, period),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        startDate: {
          gte: new Date(Date.UTC(period.year, 0, 1)),
          lt: new Date(Date.UTC(period.year + 1, 0, 1)),
        },
      },
      select: { status: true, durationDays: true },
    }),
  ]);

  const approved = requests.filter((r) => r.status === 'APPROVED');
  return {
    balance,
    attendance: attendance.totals,
    leaves: {
      approved: approved.length,
      pending: requests.filter((r) => r.status === 'PENDING').length,
      rejected: requests.filter((r) => r.status === 'REJECTED').length,
      daysUsed: round2(approved.reduce((s, r) => s + Number(r.durationDays), 0)),
    },
  };
}

// ─── shared helpers ───────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  OFFICE_CLOCK_IN: 'Started in office',
  OFFSITE_STARTED: 'Went off-site',
  RETURNED_TO_OFFICE: 'Returned to office',
  OFFSITE_LOCATION_CHANGED: 'Moved to another site',
  ADMIN_CORRECTION: 'Correction by HR',
};

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  LINE_MANAGER: 'Line Manager',
  EMPLOYEE: 'Employee',
};

const LOCATION_LABEL: Record<WorkLocationType, string> = {
  OFFICE: 'Office',
  OFFSITE: 'Off-site',
};

interface AttendanceRow {
  date: Date;
  clockInTime: Date | null;
  clockOutTime: Date | null;
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
  overtimeMinutes: number;
  status: AttendanceStatus;
  workLocation: WorkLocationType;
}

/** Who the row belongs to. `id` is needed to look the day's facts up. */
interface RowOwner {
  id: string;
  employeeIdCode: string | null;
  fullName: string;
  department: string | null;
}

function toDailyRow(
  r: AttendanceRow,
  who: RowOwner,
  facts: Map<string, DayFacts>,
): DailyAttendanceRow {
  // `@db.Date` round-trips as UTC midnight carrying the office-local Y/M/D, so
  // this slice is the local day key — the same key dayLocationFacts builds.
  const dayKey = r.date.toISOString().slice(0, 10);
  const fact = facts.get(`${who.id}|${dayKey}`);

  return {
    employeeIdCode: who.employeeIdCode ?? '—',
    employeeName: who.fullName,
    department: who.department ?? '',
    date: excelDateOnly(r.date),
    weekday: WEEKDAY_SHORT[r.date.getUTCDay()],
    clockIn: r.clockInTime ? excelInstant(r.clockInTime) : null,
    clockOut: r.clockOutTime ? excelInstant(r.clockOutTime) : null,
    workedHours: round2(r.totalWorkedMinutes / 60),
    breakHours: round2(r.totalBreakMinutes / 60),
    overtimeHours: round2(r.overtimeMinutes / 60),
    status: titleCase(r.status),
    // Every clock-in since the location feature shipped writes an OFFICE_CLOCK_IN
    // baseline (`openOfficePeriodOnClockIn`), so a clocked-in day with no events
    // is a pre-feature record — its own `workLocation` is the best answer we
    // have, and leaving the cell blank next to a filled "Final Location" would
    // read as a bug. A day never clocked into stays blank, because there really
    // is no location to report.
    initialLocation: fact
      ? LOCATION_LABEL[fact.firstLocation]
      : r.clockInTime ? LOCATION_LABEL[r.workLocation] : '',
    finalLocation: r.clockInTime ? LOCATION_LABEL[r.workLocation] : '',
    offsiteWork: fact && fact.offsiteVisits > 0 ? 'Yes' : 'No',
    offsiteHours: round2((fact?.offsiteMinutes ?? 0) / 60),
  };
}

function sumAttendance(rows: DailyAttendanceRow[]): AttendanceTotals {
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const present = count('Present');
  // "Work days" excludes weekends and holidays — days nobody was expected in.
  const workDays = rows.filter((r) => r.status !== 'Weekend' && r.status !== 'Holiday').length;
  return {
    presentDays: present,
    absentDays: count('Absent'),
    halfDays: count('Half Day'),
    leaveDays: count('Leave'),
    workDays,
    attendanceRate: workDays === 0 ? null : round2(present / workDays),
    workedHours: round2(rows.reduce((s, r) => s + r.workedHours, 0)),
    breakHours: round2(rows.reduce((s, r) => s + r.breakHours, 0)),
    overtimeHours: round2(rows.reduce((s, r) => s + r.overtimeHours, 0)),
    offsiteDays: rows.filter((r) => r.offsiteWork === 'Yes').length,
    offsiteHours: round2(rows.reduce((s, r) => s + r.offsiteHours, 0)),
  };
}

/** Creates the cycle-year balance row on first read, as the PDF reports do. */
async function ensureBalance(employeeId: string, year: number): Promise<LeaveBalanceFigures> {
  const b = await prisma.leaveBalance.upsert({
    where: { employeeId_cycleYear: { employeeId, cycleYear: year } },
    create: {
      employeeId,
      cycleYear: year,
      cycleStartDate: new Date(Date.UTC(year, 0, 1)),
      cycleEndDate: new Date(Date.UTC(year, 11, 31)),
    },
    update: {},
  });
  return {
    casualTotal: Number(b.casualTotal),
    casualUsed: Number(b.casualUsed),
    casualPending: Number(b.casualPending),
    sickTotal: Number(b.sickTotal),
    sickUsed: Number(b.sickUsed),
    sickPending: Number(b.sickPending),
    replacementBalance: Number(b.replacementBalance),
  };
}

/** `PRESENT` → `Present`, `HALF_DAY` → `Half Day`. */
function titleCase(v: string): string {
  return v
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `yyyy-MM-dd` from a `@db.Date` value, whose UTC parts are the local date. */
function dateOnlyKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Passes a `@db.Date` value through unchanged. Prisma stores those as UTC
 * midnight carrying the office-local Y/M/D, so ExcelJS's UTC serial maths
 * already lands on the right calendar day.
 */
function excelDateOnly(d: Date): Date {
  return d;
}

/**
 * Shifts a true instant into the office timezone so ExcelJS's UTC-based serial
 * conversion renders the local wall clock. Without this, an 08:58 Dhaka
 * clock-in exports as 02:58.
 */
function excelInstant(d: Date): Date {
  return new Date(d.getTime() + tzOffsetMinutes(d) * 60_000);
}

/**
 * The inverse: turns a `@db.Date` bound into the UTC instant that office-local
 * midnight actually occurred at, for querying `DateTime` columns such as
 * `WorkLocationEvent.startedAt`.
 */
function shiftToInstant(dateOnly: Date): Date {
  return new Date(dateOnly.getTime() - tzOffsetMinutes(dateOnly) * 60_000);
}

/**
 * "26 Aug 2026, 3:42 PM" in office-local time, for the workbook's
 * "Generated on" line. Formatted here rather than left as a Date because it is
 * prose on a summary sheet, not a value anyone sorts by.
 */
export function generatedOn(): string {
  return new Date().toLocaleString('en-GB', {
    timeZone: APP_TZ,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
