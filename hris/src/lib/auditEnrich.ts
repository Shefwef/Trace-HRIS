/**
 * Audit-log enrichment: resolves the "target user" (the person the audited
 * action was performed on/against) from the raw AuditLog rows.
 *
 * The AuditLog table stores `targetType` + `targetId`. To get the target user
 * we join back to the underlying entity — a leave_request has an employeeId,
 * a user targetType stores the user id directly, etc. Batching keeps this to
 * one query per targetType.
 */
import { prisma } from './db';

export interface ActorLike {
  id: string;
  fullName: string;
  email?: string;
  role: string;
}

export interface RawAuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  actor: ActorLike | null;
}

export interface EnrichedRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: ActorLike | null;
  targetUser: ActorLike | null;
  detail: string;
}

/**
 * Attach `targetUser` and a plain-text `detail` line to each audit row.
 */
export async function resolveAuditRows(rows: RawAuditRow[]): Promise<EnrichedRow[]> {
  // Group targetIds by targetType so we can batch the entity lookups.
  const byType = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.targetType || !r.targetId) continue;
    if (!byType.has(r.targetType)) byType.set(r.targetType, new Set());
    byType.get(r.targetType)!.add(r.targetId);
  }

  // Resolve entity → employeeId map per targetType.
  const entityToEmployee = new Map<string, string>(); // key = `${type}:${id}` → employeeId

  async function loadMapping<T extends { id: string; employeeId: string }>(
    type: string,
    fetch: (ids: string[]) => Promise<T[]>,
  ) {
    const ids = byType.get(type);
    if (!ids || ids.size === 0) return;
    const rowsIn = await fetch([...ids]);
    for (const row of rowsIn) entityToEmployee.set(`${type}:${row.id}`, row.employeeId);
  }

  await Promise.all([
    loadMapping('leave_request', (ids) =>
      prisma.leaveRequest.findMany({ where: { id: { in: ids } }, select: { id: true, employeeId: true } }),
    ),
    loadMapping('extra_work_log', (ids) =>
      prisma.extraWorkLog.findMany({ where: { id: { in: ids } }, select: { id: true, employeeId: true } }),
    ),
    loadMapping('work_location_event', (ids) =>
      prisma.workLocationEvent.findMany({ where: { id: { in: ids } }, select: { id: true, employeeId: true } }),
    ),
    loadMapping('attendance_record', (ids) =>
      prisma.attendanceRecord.findMany({ where: { id: { in: ids } }, select: { id: true, employeeId: true } }),
    ),
  ]);

  // targetType='user' → targetId IS the user id
  for (const r of rows) {
    if (r.targetType === 'user' && r.targetId) {
      entityToEmployee.set(`user:${r.targetId}`, r.targetId);
    }
  }

  // Batch fetch all resolved user ids in one go.
  const userIds = new Set(entityToEmployee.values());
  const users = userIds.size > 0
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, fullName: true, email: true, role: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u as ActorLike]));

  return rows.map((r) => {
    const key = r.targetType && r.targetId ? `${r.targetType}:${r.targetId}` : null;
    const targetEmpId = key ? entityToEmployee.get(key) : undefined;
    const targetUser = targetEmpId ? (userById.get(targetEmpId) ?? null) : null;

    return {
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
      actor: r.actor,
      targetUser,
      detail: formatDetail(r),
    };
  });
}

/**
 * A one-line human summary of the audit event, drawn from metadata + action.
 * The UI shows this in the "Details" column; the raw metadata JSON is still
 * available on click for anyone who needs the exact payload.
 */
function formatDetail(r: RawAuditRow): string {
  const m = (r.metadata ?? {}) as Record<string, unknown>;

  switch (r.action) {
    case 'CLOCK_IN':
      return `Clocked in${str(m.source) && m.source !== 'MANUAL' ? ` via ${str(m.source)}` : ''}`;
    case 'CLOCK_OUT':
      return `Clocked out${num(m.workedMinutes) ? ` after ${Math.round(num(m.workedMinutes)! / 60 * 10) / 10}h worked` : ''}`;
    case 'BREAK_STARTED':      return 'Started a break';
    case 'BREAK_ENDED':        return `Ended break${num(m.durationMinutes) ? ` (${num(m.durationMinutes)}m)` : ''}`;

    case 'LEAVE_APPROVED':
      return `Approved leave${num(m.finalDuration) ? ` (${num(m.finalDuration)} day${num(m.finalDuration) === 1 ? '' : 's'})` : ''}${m.modified ? ' — adjusted' : ''}`;
    case 'LEAVE_REJECTED':
      return `Rejected leave${str(m.note) ? ` — "${truncate(str(m.note)!, 80)}"` : ''}`;
    case 'LEAVE_CANCELLED':
      return `Cancelled leave${num(m.duration) ? ` (${num(m.duration)} day${num(m.duration) === 1 ? '' : 's'})` : ''}`;
    case 'LEAVE_SUBMITTED':
      return `Submitted leave request${str(m.leaveType) ? ` (${str(m.leaveType)!.toLowerCase()})` : ''}`;

    case 'EXTRA_WORK_APPROVED':
      return `Approved extra work${num(m.credit) ? ` (+${num(m.credit)} day)` : ''}`;
    case 'EXTRA_WORK_REJECTED':
      return `Rejected extra work${str(m.note) ? ` — "${truncate(str(m.note)!, 80)}"` : ''}`;
    case 'EXTRA_WORK_SUBMITTED':
      return `Logged extra work${str(m.workType) ? ` (${str(m.workType)})` : ''}`;

    case 'HOLIDAY_CREATED':
    case 'HOLIDAY_UPDATED':
    case 'HOLIDAY_DELETED':
      return `${prettyAction(r.action)}${str(m.name) ? `: ${str(m.name)}` : ''}${str(m.date) ? ` (${str(m.date)})` : ''}`;
    case 'HOLIDAY_NOTICE_SENT':
      return `Sent holiday notice${str(m.name) ? ` for "${str(m.name)}"` : ''}${num(m.recipients) ? ` to ${num(m.recipients)} people` : ''}`;

    case 'USER_INVITED':
      return `Invited new employee${str(m.email) ? ` (${str(m.email)})` : ''}`;
    case 'USER_UPDATED':
      return `Updated user${strArr(m.changed) ? ` — changed ${strArr(m.changed)!.join(', ')}` : ''}`;
    case 'USER_DEACTIVATED':
      return 'Deactivated user account';
    case 'USER_REACTIVATED':
      return 'Reactivated user account';

    case 'SETTINGS_UPDATED':
      return `Updated system settings${strArr(m.changed) ? ` — ${strArr(m.changed)!.join(', ')}` : ''}`;

    case 'PERMISSION_UPDATED':
      return `${str(m.enabled) === 'true' || m.enabled === true ? 'Enabled' : 'Disabled'} permission ${r.targetId ?? ''}`;

    case 'WORK_LOCATION_OFFSITE_STARTED':
      return `Went off-site${str(m.placeName) ? ` — ${str(m.placeName)}` : ''}${str(m.purpose) ? ` (${str(m.purpose)})` : ''}`;
    case 'WORK_LOCATION_RETURNED':
      return `Returned to office${num(m.offsiteMinutes) ? ` after ${num(m.offsiteMinutes)}m` : ''}`;
    case 'WORK_LOCATION_CHANGED':
      return `Moved to ${str(m.placeName) ?? 'new location'}`;
    case 'WORK_LOCATION_CORRECTION':
      return `Corrected work location${str(m.note) ? ` — "${truncate(str(m.note)!, 80)}"` : ''}`;

    default:
      return prettyAction(r.action);
  }
}

function prettyAction(a: string): string {
  return a.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function str(v: unknown): string | null { return typeof v === 'string' ? v : null; }
function num(v: unknown): number | null { return typeof v === 'number' ? v : null; }
function strArr(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
}
function truncate(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n - 1) + '…'; }
