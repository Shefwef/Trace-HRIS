/**
 * Work-location service. Attendance presence and physical work location are
 * two separate concepts: an employee at a ministry all afternoon is still
 * clocked in at 08:58. Nothing in this file ever writes clockInTime or
 * clockOutTime.
 *
 * The history in `work_location_events` is append-only. The only field ever
 * updated on an existing row is `endedAt` (plus `autoClosed`), which closes a
 * period. Corrections are appended as ADMIN_CORRECTION rows so the original
 * remains visible — see `correctEvent()`.
 *
 * Rule 3 ("exactly one current location") is enforced by a partial unique index
 * on (employeeId) WHERE endedAt IS NULL, not by a check in this file. A
 * double-clicked "Start Off-site Work" fails at the database rather than
 * opening two concurrent periods.
 */
import type { Role, WorkLocationType } from '@prisma/client';
import { prisma } from './db';
import { checkPermission } from './permissions';
import { localDateOnly } from './workday';

/**
 * Either the extended client or a transaction handle. Derived from the real
 * client instead of `Prisma.TransactionClient` because `db.ts` wraps the client
 * in `$extends()` for Neon cold-start retries, and the generated
 * TransactionClient type does not describe an extended client.
 */
type Tx = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$use' | '$transaction' | '$extends'
>;

/** Google Places payload captured when the employee picks a destination. */
export interface PlaceSelection {
  placeId?: string | null;
  placeName: string;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  purpose?: string | null;
}

export interface CurrentLocation {
  type: WorkLocationType;
  /** The open period, or null when the employee is not clocked in. */
  open: {
    id: string;
    eventType: string;
    placeName: string | null;
    formattedAddress: string | null;
    latitude: number | null;
    longitude: number | null;
    purpose: string | null;
    startedAt: Date;
  } | null;
  clockInTime: Date | null;
  clockOutTime: Date | null;
  attendanceId: string | null;
}

/** A domain error with a stable code the route layer maps to an HTTP status. */
export class WorkLocationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = 'WorkLocationError';
  }
}

// ─── Visibility scope ─────────────────────────────────────

/**
 * Which employees may this actor see location data for?
 *
 * `'ALL'` for holders of work_location.view_all; an explicit id list for a Line
 * Manager (their direct reports plus themselves); `null` when they may only see
 * themselves. The route layer turns that into a `where` clause — the scope is
 * decided once, here, rather than re-derived in each endpoint.
 */
export async function resolveVisibleEmployeeIds(actor: {
  id: string;
  role: Role;
  roles?: Role[] | null;
}): Promise<'ALL' | string[] | null> {
  if (await checkPermission(actor, 'work_location.view_all')) return 'ALL';

  if (await checkPermission(actor, 'work_location.view_team')) {
    const reports = await prisma.user.findMany({
      where: { lineManagerId: actor.id, isActive: true },
      select: { id: true },
    });
    // Their own row belongs on their board too.
    return [actor.id, ...reports.map((r) => r.id)];
  }

  return null;
}

/** Whether `actor` may read `targetId`'s location history. */
export async function canViewEmployee(
  actor: { id: string; role: Role; roles?: Role[] | null },
  targetId: string,
): Promise<boolean> {
  if (actor.id === targetId) return true;
  const scope = await resolveVisibleEmployeeIds(actor);
  if (scope === 'ALL') return true;
  return scope !== null && scope.includes(targetId);
}

// ─── Reads ────────────────────────────────────────────────

/** Current location for an employee, derived from today's attendance row. */
export async function getCurrentLocation(employeeId: string): Promise<CurrentLocation> {
  const date = localDateOnly();
  const [attendance, open] = await Promise.all([
    prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date } },
      select: { id: true, workLocation: true, clockInTime: true, clockOutTime: true },
    }),
    prisma.workLocationEvent.findFirst({
      where: { employeeId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    }),
  ]);

  return {
    // The open period wins: it is the row the unique index guarantees is
    // singular. attendance.workLocation is a denormalised mirror for reports.
    type: open?.newLocationType ?? attendance?.workLocation ?? 'OFFICE',
    open: open
      ? {
          id: open.id,
          eventType: open.eventType,
          placeName: open.placeName,
          formattedAddress: open.formattedAddress,
          latitude: open.latitude,
          longitude: open.longitude,
          purpose: open.purpose,
          startedAt: open.startedAt,
        }
      : null,
    clockInTime: attendance?.clockInTime ?? null,
    clockOutTime: attendance?.clockOutTime ?? null,
    attendanceId: attendance?.id ?? null,
  };
}

/** Full history for one employee, newest first. */
export async function getHistory(
  employeeId: string,
  range?: { from?: Date; to?: Date },
  limit = 200,
) {
  return prisma.workLocationEvent.findMany({
    where: {
      employeeId,
      ...(range?.from || range?.to
        ? { startedAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } }
        : {}),
    },
    include: { createdBy: { select: { id: true, fullName: true } } },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

// ─── Writes ───────────────────────────────────────────────

/**
 * Rule 1: every successful clock-in establishes an OFFICE baseline.
 *
 * Called from inside the clock-in transaction. Idempotent — if a period is
 * already open (a re-clock-in on the same day after an aborted clock-out) it
 * leaves the existing one alone rather than tripping the unique index.
 */
export async function openOfficePeriodOnClockIn(
  tx: Tx,
  args: { employeeId: string; attendanceId: string; at: Date },
): Promise<void> {
  const existing = await tx.workLocationEvent.findFirst({
    where: { employeeId: args.employeeId, endedAt: null },
    select: { id: true },
  });
  if (existing) return;

  await tx.workLocationEvent.create({
    data: {
      employeeId: args.employeeId,
      attendanceId: args.attendanceId,
      eventType: 'OFFICE_CLOCK_IN',
      previousLocationType: null,
      newLocationType: 'OFFICE',
      startedAt: args.at,
      createdById: args.employeeId,
    },
  });
}

/**
 * Rule 7: clock-out closes whatever period is open.
 *
 * If the employee was still off-site, the period is stamped `autoClosed = true`
 * rather than silently rewritten to look like they returned. HR sees the flag;
 * the times are the times.
 *
 * Returns the location the employee ended the day at, so the caller can record
 * it on the attendance row.
 */
export async function closeOpenPeriodOnClockOut(
  tx: Tx,
  args: { employeeId: string; at: Date },
): Promise<{ endedAt: WorkLocationType; autoClosed: boolean }> {
  const open = await tx.workLocationEvent.findFirst({
    where: { employeeId: args.employeeId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!open) return { endedAt: 'OFFICE', autoClosed: false };

  // Closing an OFFICE period at clock-out is the normal path. Closing an
  // OFFSITE period means the employee never marked themselves back.
  const autoClosed = open.newLocationType === 'OFFSITE';

  await tx.workLocationEvent.update({
    where: { id: open.id },
    data: { endedAt: args.at, autoClosed },
  });

  return { endedAt: open.newLocationType, autoClosed };
}

/**
 * Rule 4 + Rule 3 + Rule 6: start an off-site period, or move to a different
 * destination if already off-site.
 *
 * The close-then-open pair runs in one transaction so the partial unique index
 * never sees two open rows.
 */
export async function startOrChangeOffsite(args: {
  employeeId: string;
  actorId: string;
  place: PlaceSelection;
  at?: Date;
}): Promise<{ eventId: string; eventType: string }> {
  const at = args.at ?? new Date();
  const date = localDateOnly(at);

  const attendance = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: args.employeeId, date } },
    select: { id: true, clockInTime: true, clockOutTime: true, workLocation: true },
  });

  // Rule 4 — no off-site work without a clock-in for the day.
  if (!attendance?.clockInTime) {
    throw new WorkLocationError(
      'NOT_CLOCKED_IN',
      'Clock in first. Work location tracks where you are during a working session.',
      400,
    );
  }
  if (attendance.clockOutTime) {
    throw new WorkLocationError(
      'ALREADY_CLOCKED_OUT',
      "You've already clocked out today, so there is no open session to move.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const open = await tx.workLocationEvent.findFirst({
      where: { employeeId: args.employeeId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    const previous: WorkLocationType | null = open?.newLocationType ?? attendance.workLocation;
    // Rule 6 — already off-site means this is a destination change, not a start.
    const eventType = previous === 'OFFSITE' ? 'OFFSITE_LOCATION_CHANGED' : 'OFFSITE_STARTED';

    if (open) {
      await tx.workLocationEvent.update({
        where: { id: open.id },
        data: { endedAt: at },
      });
    }

    const created = await tx.workLocationEvent.create({
      data: {
        employeeId: args.employeeId,
        attendanceId: attendance.id,
        eventType,
        previousLocationType: previous,
        newLocationType: 'OFFSITE',
        placeId: args.place.placeId ?? null,
        placeName: args.place.placeName,
        formattedAddress: args.place.formattedAddress ?? null,
        latitude: args.place.latitude ?? null,
        longitude: args.place.longitude ?? null,
        purpose: args.place.purpose?.slice(0, 200) ?? null,
        startedAt: at,
        createdById: args.actorId,
      },
    });

    // Rule 2 — only the location mirror is touched. Clock times are untouched.
    await tx.attendanceRecord.update({
      where: { id: attendance.id },
      data: { workLocation: 'OFFSITE' },
    });

    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: eventType,
        targetType: 'work_location_event',
        targetId: created.id,
        metadata: {
          employeeId: args.employeeId,
          placeName: args.place.placeName,
          formattedAddress: args.place.formattedAddress ?? null,
          purpose: args.place.purpose ?? null,
        },
      },
    });

    return { eventId: created.id, eventType };
  });
}

/** Rule 5: return to office. Rejected when the employee is already in office. */
export async function returnToOffice(args: {
  employeeId: string;
  actorId: string;
  at?: Date;
}): Promise<{ eventId: string; offsiteMinutes: number }> {
  const at = args.at ?? new Date();
  const date = localDateOnly(at);

  const attendance = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: args.employeeId, date } },
    select: { id: true, clockInTime: true, clockOutTime: true, workLocation: true },
  });
  if (!attendance?.clockInTime) {
    throw new WorkLocationError('NOT_CLOCKED_IN', 'You are not clocked in today.', 400);
  }
  if (attendance.clockOutTime) {
    throw new WorkLocationError(
      'ALREADY_CLOCKED_OUT',
      "You've already clocked out today.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const open = await tx.workLocationEvent.findFirst({
      where: { employeeId: args.employeeId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    // Rule 5 — nothing to return from.
    if (!open || open.newLocationType !== 'OFFSITE') {
      throw new WorkLocationError(
        'ALREADY_IN_OFFICE',
        'You are already recorded as working in the office.',
      );
    }

    await tx.workLocationEvent.update({
      where: { id: open.id },
      data: { endedAt: at },
    });

    const created = await tx.workLocationEvent.create({
      data: {
        employeeId: args.employeeId,
        attendanceId: attendance.id,
        eventType: 'RETURNED_TO_OFFICE',
        previousLocationType: 'OFFSITE',
        newLocationType: 'OFFICE',
        startedAt: at,
        createdById: args.actorId,
      },
    });

    await tx.attendanceRecord.update({
      where: { id: attendance.id },
      data: { workLocation: 'OFFICE' },
    });

    const offsiteMinutes = Math.max(
      0,
      Math.round((at.getTime() - open.startedAt.getTime()) / 60_000),
    );

    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: 'RETURNED_TO_OFFICE',
        targetType: 'work_location_event',
        targetId: created.id,
        metadata: {
          employeeId: args.employeeId,
          closedEventId: open.id,
          offsiteMinutes,
        },
      },
    });

    return { eventId: created.id, offsiteMinutes };
  });
}

/**
 * HR/Admin correction. Appends an ADMIN_CORRECTION row describing the intended
 * state and closes the erroneous period if it is still open. The original row
 * keeps its original times — nothing is overwritten, so the audit trail still
 * shows what was recorded before the correction and who changed it.
 */
export async function correctEvent(args: {
  eventId: string;
  actorId: string;
  note: string;
  endedAt?: Date | null;
}): Promise<{ correctionId: string }> {
  const target = await prisma.workLocationEvent.findUnique({
    where: { id: args.eventId },
  });
  if (!target) throw new WorkLocationError('NOT_FOUND', 'Location event not found.', 404);

  const at = args.endedAt ?? new Date();

  return prisma.$transaction(async (tx) => {
    if (target.endedAt === null) {
      await tx.workLocationEvent.update({
        where: { id: target.id },
        data: { endedAt: at, autoClosed: false },
      });
      await tx.attendanceRecord.updateMany({
        where: { employeeId: target.employeeId, id: target.attendanceId ?? undefined },
        data: { workLocation: 'OFFICE' },
      });
    }

    const created = await tx.workLocationEvent.create({
      data: {
        employeeId: target.employeeId,
        attendanceId: target.attendanceId,
        eventType: 'ADMIN_CORRECTION',
        previousLocationType: target.newLocationType,
        newLocationType: 'OFFICE',
        purpose: args.note.slice(0, 200),
        startedAt: at,
        endedAt: at,
        createdById: args.actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: 'WORK_LOCATION_CORRECTED',
        targetType: 'work_location_event',
        targetId: created.id,
        metadata: {
          employeeId: target.employeeId,
          correctedEventId: target.id,
          note: args.note,
        },
      },
    });

    return { correctionId: created.id };
  });
}

// ─── Aggregation for admin views and reports ──────────────

export interface TeamLocationRow {
  employeeId: string;
  fullName: string;
  employeeIdCode: string | null;
  department: string | null;
  designation: string | null;
  locationType: WorkLocationType;
  clockInTime: Date | null;
  clockOutTime: Date | null;
  placeName: string | null;
  formattedAddress: string | null;
  purpose: string | null;
  startedAt: Date | null;
  /** Minutes at the current location, live. Null when not clocked in. */
  durationMinutes: number | null;
  lastChangeAt: Date | null;
  autoClosedToday: boolean;
}

/**
 * Everyone's current location for one day. `employeeIds` scopes the result —
 * the route layer passes a Line Manager's team, or undefined for HR/Admin.
 */
export async function getLocationBoard(args: {
  date: Date;
  employeeIds?: string[];
  now?: Date;
}): Promise<TeamLocationRow[]> {
  const now = args.now ?? new Date();

  const employees = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { not: 'SUPER_ADMIN' },
      ...(args.employeeIds ? { id: { in: args.employeeIds } } : {}),
    },
    select: {
      id: true, fullName: true, employeeIdCode: true,
      department: true, designation: true,
    },
    orderBy: { fullName: 'asc' },
  });
  if (employees.length === 0) return [];

  const ids = employees.map((e) => e.id);
  const [records, events] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employeeId: { in: ids }, date: args.date },
      select: {
        id: true, employeeId: true, workLocation: true,
        clockInTime: true, clockOutTime: true,
      },
    }),
    prisma.workLocationEvent.findMany({
      where: { employeeId: { in: ids }, attendance: { date: args.date } },
      orderBy: { startedAt: 'asc' },
    }),
  ]);

  const recordByEmployee = new Map(records.map((r) => [r.employeeId, r]));
  const eventsByEmployee = new Map<string, typeof events>();
  for (const e of events) {
    const list = eventsByEmployee.get(e.employeeId) ?? [];
    list.push(e);
    eventsByEmployee.set(e.employeeId, list);
  }

  return employees.map((emp) => {
    const record = recordByEmployee.get(emp.id);
    const dayEvents = eventsByEmployee.get(emp.id) ?? [];
    const open = dayEvents.find((e) => e.endedAt === null) ?? null;
    const latest = dayEvents.length > 0 ? dayEvents[dayEvents.length - 1] : null;
    const current = open ?? latest;

    return {
      employeeId: emp.id,
      fullName: emp.fullName,
      employeeIdCode: emp.employeeIdCode,
      department: emp.department,
      designation: emp.designation,
      locationType: current?.newLocationType ?? record?.workLocation ?? 'OFFICE',
      clockInTime: record?.clockInTime ?? null,
      clockOutTime: record?.clockOutTime ?? null,
      placeName: current?.placeName ?? null,
      formattedAddress: current?.formattedAddress ?? null,
      purpose: current?.purpose ?? null,
      startedAt: current?.startedAt ?? null,
      durationMinutes: current
        ? Math.max(
            0,
            Math.round(
              ((current.endedAt ?? now).getTime() - current.startedAt.getTime()) / 60_000,
            ),
          )
        : null,
      lastChangeAt: dayEvents.length > 1 ? (latest?.startedAt ?? null) : null,
      autoClosedToday: dayEvents.some((e) => e.autoClosed),
    };
  });
}

/** What one employee's location history says about one attendance day. */
export interface DayLocationFacts {
  /**
   * Where the day began. Normally OFFICE — the clock-in baseline — but an
   * employee who went straight to a client site starts the day OFFSITE.
   */
  firstLocation: WorkLocationType;
  /** Total minutes spent off-site. Open periods are measured to `now`. */
  offsiteMinutes: number;
  /** Distinct off-site periods. Two site visits in one day count as two. */
  offsiteVisits: number;
}

/**
 * Per-employee-per-day location facts over a range, keyed `employeeId|yyyy-MM-dd`.
 * Feeds the attendance report's location columns in one pass.
 *
 * There is deliberately no "final location" here: that is the denormalised
 * `attendanceRecord.workLocation` mirror, which clock-out leaves untouched and
 * corrections reset — so the attendance row already carries the authoritative
 * answer and re-deriving it from events would only disagree with it.
 *
 * Events with no `attendanceId` (admin corrections on historical days) are out
 * of scope: without an attendance row there is no day to file them under.
 */
export async function dayLocationFacts(args: {
  employeeIds: string[];
  from: Date;
  to: Date;
  now?: Date;
}): Promise<Map<string, DayLocationFacts>> {
  const now = args.now ?? new Date();
  if (args.employeeIds.length === 0) return new Map();

  const events = await prisma.workLocationEvent.findMany({
    where: {
      employeeId: { in: args.employeeIds },
      attendance: { date: { gte: args.from, lt: args.to } },
      // Corrections are zero-length audit markers, not periods — counting one
      // would report a phantom OFFICE period at the moment HR clicked.
      eventType: { not: 'ADMIN_CORRECTION' },
    },
    select: {
      employeeId: true, newLocationType: true, startedAt: true, endedAt: true,
      attendance: { select: { date: true } },
    },
    orderBy: { startedAt: 'asc' },
  });

  const facts = new Map<string, DayLocationFacts>();
  for (const e of events) {
    if (!e.attendance) continue;
    // A `@db.Date` column round-trips as UTC midnight carrying the office-local
    // Y/M/D, so slicing the ISO string yields the local day key, not a UTC one.
    const key = `${e.employeeId}|${e.attendance.date.toISOString().slice(0, 10)}`;

    let day = facts.get(key);
    if (!day) {
      // Ordered ascending, so the first event seen for a key opened the day.
      day = { firstLocation: e.newLocationType, offsiteMinutes: 0, offsiteVisits: 0 };
      facts.set(key, day);
    }

    if (e.newLocationType === 'OFFSITE') {
      day.offsiteVisits += 1;
      day.offsiteMinutes += Math.max(
        0,
        Math.round(((e.endedAt ?? now).getTime() - e.startedAt.getTime()) / 60_000),
      );
    }
  }
  return facts;
}
