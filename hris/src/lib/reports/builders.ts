/**
 * One builder per report. Each takes already-queried data from `data.ts` and
 * returns a finished workbook — the column lists live here because they are a
 * presentation decision, and the numbers behind them are settled before this
 * file runs.
 *
 * Sheet counts are deliberate. The performance summary is a single sheet
 * because it has one sheet's worth of content; padding it with an empty
 * "Daily Attendance" tab would make the workbook look thorough and read worse.
 */
import type { Workbook } from 'exceljs';
import {
  addRows, addSheet, addSummarySheet, addTotalsRow, createWorkbook,
  type CellValue, type Col,
} from './workbook';
import {
  generatedOn,
  type AttendanceReportData, type AttendanceTotals, type CompanyReportData,
  type Identity, type LeaveReportData, type OffsiteEventRow, type Period,
  type SummaryReportData,
} from './data';

// ─── column sets ──────────────────────────────────────────

/** §25, in the order the spec lists them, with break/overtime folded in. */
const DAILY_COLS: Col[] = [
  { header: 'Employee ID', key: 'employeeIdCode', width: 14 },
  { header: 'Employee Name', key: 'employeeName', width: 26 },
  { header: 'Department', key: 'department', width: 20 },
  { header: 'Date', key: 'date', format: 'date' },
  { header: 'Day', key: 'weekday', width: 8 },
  { header: 'Clock In', key: 'clockIn', format: 'time' },
  { header: 'Clock Out', key: 'clockOut', format: 'time' },
  { header: 'Total Hours', key: 'workedHours', format: 'decimal', total: true },
  { header: 'Break Hours', key: 'breakHours', format: 'decimal', total: true },
  { header: 'Overtime Hours', key: 'overtimeHours', format: 'decimal', total: true },
  { header: 'Attendance Status', key: 'status', width: 18 },
  { header: 'Initial Location', key: 'initialLocation', width: 16 },
  { header: 'Final Location', key: 'finalLocation', width: 16 },
  { header: 'Off-site Work', key: 'offsiteWork', width: 13 },
  { header: 'Off-site Hours', key: 'offsiteHours', format: 'decimal', total: true },
];

/** §26. */
const OFFSITE_COLS: Col[] = [
  { header: 'Employee ID', key: 'employeeIdCode', width: 14 },
  { header: 'Employee Name', key: 'employeeName', width: 26 },
  { header: 'Date', key: 'date', format: 'date' },
  { header: 'Event', key: 'event', width: 22 },
  { header: 'Location Name', key: 'placeName', width: 30 },
  { header: 'Address', key: 'address', width: 44 },
  { header: 'Latitude', key: 'latitude', width: 12 },
  { header: 'Longitude', key: 'longitude', width: 12 },
  { header: 'Purpose', key: 'purpose', width: 34 },
  { header: 'Started At', key: 'startedAt', format: 'time' },
  { header: 'Ended At', key: 'endedAt', format: 'time' },
  { header: 'Duration (hours)', key: 'durationHours', format: 'decimal', total: true },
  { header: 'Recorded By', key: 'changedBy', width: 24 },
  { header: 'Auto-closed', key: 'autoClosed', width: 12 },
];

const LEAVE_COLS: Col[] = [
  { header: 'Employee ID', key: 'employeeIdCode', width: 14 },
  { header: 'Employee Name', key: 'employeeName', width: 26 },
  { header: 'Leave Type', key: 'leaveType', width: 14 },
  { header: 'Start Date', key: 'startDate', format: 'date' },
  { header: 'End Date', key: 'endDate', format: 'date' },
  { header: 'Duration (days)', key: 'durationDays', format: 'decimal', total: true },
  { header: 'Half Day', key: 'halfDay', width: 12 },
  { header: 'Time From', key: 'timeFrom', width: 11 },
  { header: 'Time To', key: 'timeTo', width: 11 },
  { header: 'Reason', key: 'reason', width: 34 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Reviewed By', key: 'reviewer', width: 24 },
  { header: 'Reviewed At', key: 'reviewedAt', format: 'date' },
  { header: 'Applied On', key: 'appliedOn', format: 'date' },
  { header: 'Admin Note', key: 'adminNote', width: 40 },
];

const EMPLOYEE_COLS: Col[] = [
  { header: 'Employee ID', key: 'employeeIdCode', width: 14 },
  { header: 'Employee Name', key: 'employeeName', width: 26 },
  { header: 'Email', key: 'email', width: 34 },
  { header: 'Department', key: 'department', width: 20 },
  { header: 'Designation', key: 'designation', width: 24 },
  { header: 'Role', key: 'role', width: 14 },
  { header: 'Line Manager', key: 'lineManager', width: 24 },
  { header: 'Present Days', key: 'presentDays', format: 'int', total: true },
  { header: 'Work Days', key: 'workDays', format: 'int', total: true },
  { header: 'Attendance Rate', key: 'attendanceRate', format: 'percent', width: 15 },
  { header: 'Worked Hours', key: 'workedHours', format: 'decimal', total: true },
  { header: 'Overtime Hours', key: 'overtimeHours', format: 'decimal', total: true },
  { header: 'Off-site Days', key: 'offsiteDays', format: 'int', total: true },
  { header: 'Off-site Hours', key: 'offsiteHours', format: 'decimal', total: true },
  { header: 'Casual Used', key: 'casualUsed', format: 'decimal' },
  { header: 'Casual Total', key: 'casualTotal', format: 'decimal' },
  { header: 'Sick Used', key: 'sickUsed', format: 'decimal' },
  { header: 'Sick Total', key: 'sickTotal', format: 'decimal' },
  { header: 'Replacement Balance', key: 'replacementBalance', format: 'decimal', width: 18 },
  { header: 'Approved Leaves', key: 'approvedLeaves', format: 'int', total: true },
  { header: 'Pending Leaves', key: 'pendingLeaves', format: 'int', total: true },
];

// ─── builders ─────────────────────────────────────────────

export function buildAttendanceWorkbook(
  employee: Identity,
  period: Period,
  data: AttendanceReportData,
): Workbook {
  const wb = createWorkbook();
  wb.title = `Attendance report — ${employee.fullName} — ${period.label}`;

  addSummarySheet(wb, 'Summary', [
    { heading: 'Report', rows: reportMeta('Attendance report', period) },
    { heading: 'Employee', rows: employeeMeta(employee) },
    { heading: 'Attendance', rows: attendanceMeta(data.totals) },
  ]);

  const daily = addSheet(wb, 'Daily Attendance', DAILY_COLS);
  addRows(daily, data.daily);
  addTotalsRow(daily, DAILY_COLS);

  // Only when there is something to show — an empty tab reads as a bug.
  if (data.offsite.length > 0) addOffsiteSheet(wb, data.offsite);

  return wb;
}

export function buildLeavesWorkbook(
  employee: Identity,
  period: Period,
  data: LeaveReportData,
): Workbook {
  const wb = createWorkbook();
  wb.title = `Leave history — ${employee.fullName} — ${period.label}`;

  const b = data.balance;
  addSummarySheet(wb, 'Summary', [
    { heading: 'Report', rows: reportMeta('Leave history', period) },
    { heading: 'Employee', rows: employeeMeta(employee) },
    {
      heading: 'Leave balance',
      rows: [
        ['Casual — entitled', b.casualTotal],
        ['Casual — used', b.casualUsed],
        ['Casual — pending approval', b.casualPending],
        ['Casual — remaining', round2(b.casualTotal - b.casualUsed - b.casualPending)],
        ['Sick — entitled', b.sickTotal],
        ['Sick — used', b.sickUsed],
        ['Sick — pending approval', b.sickPending],
        ['Sick — remaining', round2(b.sickTotal - b.sickUsed - b.sickPending)],
        ['Replacement balance (earned)', b.replacementBalance],
      ],
    },
    {
      heading: 'Requests this cycle',
      rows: [
        ['Approved', data.counts.approved],
        ['Pending', data.counts.pending],
        ['Rejected', data.counts.rejected],
        ['Cancelled', data.counts.cancelled],
        ['Total days approved', data.counts.daysUsed],
      ],
    },
  ]);

  const sheet = addSheet(wb, 'Leave Requests', LEAVE_COLS);
  addRows(sheet, data.requests);
  addTotalsRow(sheet, LEAVE_COLS);

  return wb;
}

/**
 * The performance summary. One sheet on purpose: it exists to be read at a
 * glance, and the underlying rows are what the attendance and leave workbooks
 * are for.
 */
export function buildSummaryWorkbook(
  employee: Identity,
  period: Period,
  data: SummaryReportData,
): Workbook {
  const wb = createWorkbook();
  wb.title = `Performance summary — ${employee.fullName} — ${period.label}`;

  const b = data.balance;
  addSummarySheet(wb, 'Performance Summary', [
    { heading: 'Report', rows: reportMeta('Performance summary', period) },
    { heading: 'Employee', rows: employeeMeta(employee) },
    { heading: `Attendance — ${period.label}`, rows: attendanceMeta(data.attendance) },
    {
      heading: `Leave — cycle ${period.year}`,
      rows: [
        ['Casual remaining', round2(b.casualTotal - b.casualUsed - b.casualPending)],
        ['Sick remaining', round2(b.sickTotal - b.sickUsed - b.sickPending)],
        ['Replacement balance', b.replacementBalance],
        ['Requests approved', data.leaves.approved],
        ['Requests pending', data.leaves.pending],
        ['Requests rejected', data.leaves.rejected],
        ['Days approved', data.leaves.daysUsed],
      ],
    },
  ]);

  return wb;
}

export function buildCompanyWorkbook(
  period: Period,
  data: CompanyReportData,
  scopeLabel: string,
): Workbook {
  const wb = createWorkbook();
  wb.title = `Company report — ${period.label}`;

  addSummarySheet(wb, 'Summary', [
    { heading: 'Report', rows: [...reportMeta('Company cycle report', period), ['Scope', scopeLabel]] },
    {
      heading: 'Headline figures',
      rows: [
        ['Employees included', data.totals.headcount],
        ['Present days (all employees)', data.totals.presentDays],
        ['Expected work days (all employees)', data.totals.workDays],
        ['Attendance rate %', data.totals.attendanceRate],
        ['Overtime hours', data.totals.overtimeHours],
        ['Off-site hours', data.totals.offsiteHours],
        ['Leave requests approved', data.totals.approvedLeaves],
        ['Leave requests pending', data.totals.pendingLeaves],
      ],
    },
  ]);

  const emp = addSheet(wb, 'Employee Summary', EMPLOYEE_COLS);
  addRows(emp, data.employees);
  addTotalsRow(emp, EMPLOYEE_COLS);

  const daily = addSheet(wb, 'Daily Attendance', DAILY_COLS);
  addRows(daily, data.daily);
  addTotalsRow(daily, DAILY_COLS);

  if (data.offsite.length > 0) addOffsiteSheet(wb, data.offsite);

  const leaves = addSheet(wb, 'Leave Requests', LEAVE_COLS);
  addRows(leaves, data.leaves);
  addTotalsRow(leaves, LEAVE_COLS);

  return wb;
}

/** §26 as a standalone report — off-site work on its own, across the team. */
export function buildOffsiteWorkbook(
  period: Period,
  rows: OffsiteEventRow[],
  scopeLabel: string,
): Workbook {
  const wb = createWorkbook();
  wb.title = `Off-site work report — ${period.label}`;

  const offsiteRows = rows.filter((r) => r.durationHours !== null);
  const employees = new Set(rows.map((r) => r.employeeName)).size;

  addSummarySheet(wb, 'Summary', [
    { heading: 'Report', rows: [...reportMeta('Off-site work report', period), ['Scope', scopeLabel]] },
    {
      heading: 'Headline figures',
      rows: [
        ['Employees with off-site activity', employees],
        ['Location periods recorded', offsiteRows.length],
        ['Total off-site hours', round2(offsiteRows.reduce((s, r) => s + (r.durationHours ?? 0), 0))],
        ['Periods auto-closed at clock-out', rows.filter((r) => r.autoClosed === 'Yes').length],
        ['Corrections by HR', rows.filter((r) => r.event === 'Correction by HR').length],
      ],
    },
  ]);

  addOffsiteSheet(wb, rows);
  return wb;
}

// ─── shared pieces ────────────────────────────────────────

function addOffsiteSheet(wb: Workbook, rows: OffsiteEventRow[]): void {
  const sheet = addSheet(wb, 'Off-site Work', OFFSITE_COLS);
  addRows(sheet, rows);
  addTotalsRow(sheet, OFFSITE_COLS);
}

function reportMeta(title: string, period: Period): [string, CellValue][] {
  return [
    ['Report', title],
    ['Period', period.label],
    ['Generated on', generatedOn()],
    ['Source', 'TRACE HRMS'],
  ];
}

function employeeMeta(e: Identity): [string, CellValue][] {
  return [
    ['Employee ID', e.employeeIdCode ?? '—'],
    ['Name', e.fullName],
    ['Email', e.email],
    ['Department', e.department ?? '—'],
    ['Designation', e.designation ?? '—'],
  ];
}

function attendanceMeta(t: AttendanceTotals): [string, CellValue][] {
  return [
    ['Present days', t.presentDays],
    ['Half days', t.halfDays],
    ['Leave days', t.leaveDays],
    ['Absent days', t.absentDays],
    ['Expected work days', t.workDays],
    ['Attendance rate %', t.attendanceRate],
    ['Hours worked', t.workedHours],
    ['Break hours', t.breakHours],
    ['Overtime hours', t.overtimeHours],
    ['Days with off-site work', t.offsiteDays],
    ['Off-site hours', t.offsiteHours],
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
