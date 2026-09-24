/**
 * Core biometric punch ingest pipeline.
 *
 * Every transport (the office agent over HTTPS, the DB reader fallback, and the
 * QA simulator) calls ingestPunches() and nothing else. Timezone conversion,
 * deduplication, employee mapping, and attendance writing all happen here once.
 *
 * Timezone note: the ZKTeco device sends wall-clock text with no UTC offset.
 * "2026-08-25 09:02:13" means 09:02 in Dhaka (Asia/Dhaka, UTC+6, no DST).
 * We parse it in that zone and convert to UTC before any DB write.
 */
import { prisma } from './db';
import { localDateOnly, localDayBounds, localDayKey } from './workday';

/**
 * Minutes in a scheduled workday derived from the office window.
 * `workStartTime`/`workEndTime` are "HH:mm" strings in office-local time.
 * A 08:30 → 17:30 window yields 540 minutes (9 h) — the value used to
 * split worked time into overtime vs deficit.
 */
function standardMinutesFromWindow(workStartTime: string, workEndTime: string): number {
  const [sh, sm] = workStartTime.split(':').map(Number);
  const [eh, em] = workEndTime.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const diff = endMin - startMin;
  return diff > 0 ? diff : 0;
}

/**
 * When only ONE punch is recorded for a day, we can't tell "did they come in
 * late and forget to tap out" from "did they forget to tap in and only tap
 * out on the way home". Use the hour of the punch as a tiebreaker: at or
 * after 14:00 office-local, treat the lone punch as clock-OUT (they clearly
 * worked most of the day and only remembered to tap on exit). Before 14:00,
 * treat it as clock-IN (they probably arrived and forgot to tap on exit).
 */
const SINGLE_PUNCH_CLOCKOUT_HOUR = 14;

/** Hour of day (0-23) for a UTC instant in office-local time. */
function localHour(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return h % 24;
}

/**
 * Decide clock-in / clock-out from a sorted list of punches for one day.
 * - 0 punches → both null
 * - 1 punch, before 14:00 → clock-in only
 * - 1 punch, at/after 14:00 → clock-out only
 * - 2+ punches → earliest is clock-in, latest is clock-out
 */
function resolveInOut(punches: Date[]): { clockIn: Date | null; clockOut: Date | null } {
  if (punches.length === 0) return { clockIn: null, clockOut: null };
  if (punches.length === 1) {
    const single = punches[0];
    return localHour(single) >= SINGLE_PUNCH_CLOCKOUT_HOUR
      ? { clockIn: null, clockOut: single }
      : { clockIn: single, clockOut: null };
  }
  return { clockIn: punches[0], clockOut: punches[punches.length - 1] };
}

export interface RawPunch {
  deviceUserId: string;
  punchedAt: string;        // "YYYY-MM-DD HH:MM:SS", wall-clock in device timezone
  punchState: string;       // "0" = In, "1" = Out; "2"–"5" ignored
  verifyType?: number;
  sourceId?: string;        // vendor's transaction id, kept in rawPayload
}

export interface IngestInput {
  deviceSerial: string;
  punches: RawPunch[];
  /** Override the timezone; defaults to BIOMETRIC_TZ env var or Asia/Dhaka. */
  tz?: string;
  /** MOCK marks simulator punches in the source field. */
  isMock?: boolean;
}

export interface IngestResult {
  received: number;
  applied: number;
  duplicates: number;
  unmapped: number;
  rejected: number;
}

const BIOMETRIC_TZ = process.env.BIOMETRIC_TZ ?? 'Asia/Dhaka';

/** Parse "YYYY-MM-DD HH:MM:SS" as a wall-clock time in `tz`, return UTC Date. */
function parsePunchTime(raw: string, tz: string): Date | null {
  // Build an ISO-like string with a zone suffix that Intl can resolve.
  // We format a probe date in the zone to get the offset, then subtract it.
  const [datePart, timePart] = raw.split(' ');
  if (!datePart || !timePart) return null;
  const [Y, M, D] = datePart.split('-').map(Number);
  const [h, m, s] = timePart.split(':').map(Number);
  if ([Y, M, D, h, m, s].some((n) => isNaN(n))) return null;

  // Build a provisional UTC date, then shift by the zone's offset.
  const provisional = new Date(Date.UTC(Y, M - 1, D, h, m, s));
  const offsetMs = getOffsetMs(provisional, tz);
  return new Date(provisional.getTime() - offsetMs);
}

/** Returns how many ms the zone is ahead of UTC at the given UTC instant. */
function getOffsetMs(utcInstant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(utcInstant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const local = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  return Math.round(local - utcInstant.getTime());
}

export async function ingestPunches(input: IngestInput): Promise<IngestResult> {
  const tz = input.tz ?? BIOMETRIC_TZ;
  const result: IngestResult = {
    received: input.punches.length,
    applied: 0,
    duplicates: 0,
    unmapped: 0,
    rejected: 0,
  };

  // 1. Resolve device.
  const device = await prisma.biometricDevice.findUnique({
    where: { serial: input.deviceSerial },
  });
  if (!device || !device.isActive) {
    result.rejected = input.punches.length;
    await prisma.biometricSyncLog.create({
      data: {
        deviceId: device?.id ?? null,
        received: result.received,
        error: device ? 'Device is inactive' : `Unknown device: ${input.deviceSerial}`,
      },
    });
    return result;
  }

  // Touch lastSeenAt
  await prisma.biometricDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  // 2. Filter to known punch states and parse timestamps.
  //    We accept '0'/'1'/'255' but never rely on that value to decide In vs Out;
  //    the time-of-day rule (see rebuildAttendanceDay) is the source of truth,
  //    because the ZKTeco M2-LR at Trace sends '255' for every tap and any
  //    toggle-based interpretation reverses when polls arrive out of order.
  type ParsedPunch = { raw: RawPunch; punchedAtUtc: Date };

  const valid: ParsedPunch[] = [];
  for (const p of input.punches) {
    if (p.punchState !== '0' && p.punchState !== '1' && p.punchState !== '255') continue;
    const punchedAtUtc = parsePunchTime(p.punchedAt, tz);
    if (!punchedAtUtc) { result.rejected++; continue; }
    valid.push({ raw: p, punchedAtUtc });
  }

  valid.sort((a, b) => a.punchedAtUtc.getTime() - b.punchedAtUtc.getTime());

  if (valid.length === 0) {
    await prisma.biometricSyncLog.create({
      data: { deviceId: device.id, received: result.received },
    });
    return result;
  }

  // 3. Upsert punches — unique index on (deviceId, deviceUserId, punchedAt)
  //    makes duplicates a no-op via skipDuplicates.
  const toInsert = valid.map((p) => ({
    deviceId: device.id,
    deviceUserId: p.raw.deviceUserId,
    punchedAt: p.punchedAtUtc,
    punchState: p.raw.punchState,
    verifyType: p.raw.verifyType ?? null,
    rawPayload: p.raw as object,
  }));

  const createResult = await prisma.biometricPunch.createMany({
    data: toInsert,
    skipDuplicates: true,
  });

  result.duplicates = valid.length - createResult.count;

  if (createResult.count === 0) {
    await prisma.biometricSyncLog.create({
      data: {
        deviceId: device.id,
        received: result.received,
        applied: 0,
        duplicates: result.duplicates,
        unmapped: 0,
      },
    });
    return result;
  }

  // 4. Map deviceUserId → User.biometricUserId for newly-inserted rows.
  const newPunchRows = await prisma.biometricPunch.findMany({
    where: {
      deviceId: device.id,
      punchedAt: { in: valid.map((p) => p.punchedAtUtc) },
      appliedAt: null,
    },
  });

  const deviceUserIds = [...new Set(newPunchRows.map((r) => r.deviceUserId))];
  const userRows = await prisma.user.findMany({
    where: { biometricUserId: { in: deviceUserIds } },
    select: { id: true, biometricUserId: true },
  });
  const deviceToEmployee = new Map(userRows.map((u) => [u.biometricUserId!, u.id]));

  // 5. Mark each new punch as applied and collect (employee, day) pairs to rebuild.
  const affectedDays = new Map<string, { employeeId: string; date: Date }>();

  for (const punch of newPunchRows) {
    const employeeId = deviceToEmployee.get(punch.deviceUserId) ?? null;
    await prisma.biometricPunch.update({
      where: { id: punch.id },
      data: { employeeId, appliedAt: employeeId ? new Date() : null },
    });
    if (!employeeId) { result.unmapped++; continue; }
    const date = localDateOnly(punch.punchedAt);
    affectedDays.set(`${employeeId}|${date.toISOString()}`, { employeeId, date });
    result.applied++;
  }

  // 6. Recompute attendance for every affected (employee, day) from ALL stored
  //    punches — new + prior — using the time-of-day rule. This is idempotent
  //    and self-healing, so late-arriving punches will always produce the right
  //    clock-in / clock-out.
  for (const { employeeId, date } of affectedDays.values()) {
    await rebuildAttendanceDay(employeeId, date, device.serial, tz, input.isMock ?? false);
  }

  await prisma.biometricSyncLog.create({
    data: {
      deviceId: device.id,
      received: result.received,
      applied: result.applied,
      duplicates: result.duplicates,
      unmapped: result.unmapped,
    },
  });

  return result;
}

// ─── Attendance rebuild ────────────────────────────────────

/**
 * Recomputes one attendance record from every biometric punch belonging to
 * `employeeId` on the local `date`. Never touches MANUAL records.
 *
 * Rules:
 *   * clockIn  = earliest stored punch of the day
 *   * clockOut = latest stored punch of the day (null when there's only one tap)
 *   * totalWorked = clockOut − clockIn
 *   * standard  = workEndTime − workStartTime (from SystemSettings)
 *   * overtime  = max(0, worked − standard)
 *   * deficit   = max(0, standard − worked)  (only when both taps exist)
 */
async function rebuildAttendanceDay(
  employeeId: string,
  date: Date,
  deviceSerial: string | null,
  _tz: string,
  isMock: boolean,
  cachedStandardMinutes?: number,
): Promise<void> {
  const dayKey = date.toISOString().slice(0, 10);
  const { start, end } = localDayBounds(dayKey);

  const allPunches = await prisma.biometricPunch.findMany({
    where: { employeeId, punchedAt: { gte: start, lt: end } },
    orderBy: { punchedAt: 'asc' },
    select: { punchedAt: true },
  });

  if (allPunches.length === 0) return;

  const { clockIn, clockOut } = resolveInOut(allPunches.map((p) => p.punchedAt));

  const totalWorkedMinutes = clockIn && clockOut
    ? Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000))
    : 0;

  let standardMinutes = cachedStandardMinutes ?? 0;
  if (cachedStandardMinutes === undefined) {
    const s = await prisma.systemSettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    standardMinutes = standardMinutesFromWindow(s.workStartTime, s.workEndTime);
  }

  const overtimeMinutes = clockOut
    ? Math.max(0, totalWorkedMinutes - standardMinutes)
    : 0;
  const deficitMinutes = clockOut
    ? Math.max(0, standardMinutes - totalWorkedMinutes)
    : 0;

  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId, date } },
  });

  // Manual corrections always win.
  if (existing && existing.source === 'MANUAL') return;

  if (existing) {
    await prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        clockInTime: clockIn,
        clockOutTime: clockOut,
        totalWorkedMinutes,
        overtimeMinutes,
        deficitMinutes,
        status: 'PRESENT',
        source: isMock ? 'MOCK' : 'BIOMETRIC',
        ...(deviceSerial ? { biometricDeviceId: deviceSerial } : {}),
      },
    });
  } else {
    await prisma.attendanceRecord.create({
      data: {
        employeeId,
        date,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        totalWorkedMinutes,
        overtimeMinutes,
        deficitMinutes,
        status: 'PRESENT',
        source: isMock ? 'MOCK' : 'BIOMETRIC',
        ...(deviceSerial ? { biometricDeviceId: deviceSerial } : {}),
      },
    });
  }
}

/**
 * Rebuild attendance for every (employee, day) that has stored punches in
 * [from, to). Used by the admin "Recompute" button to fix historical rows
 * after a bugfix or manual DB tinkering. `from`/`to` are UTC instants.
 *
 * Also re-maps any biometricPunch rows with employeeId=null across ALL history
 * (not just the date range) so that employees added to the mapping after their
 * punches were first ingested get their historical attendance built correctly.
 *
 * A module-level mutex serialises concurrent calls — two admins clicking
 * Recompute at once would otherwise exhaust the Prisma connection pool
 * because each pass loops over thousands of days.
 */
let rebuildInFlight: Promise<{ rebuilt: number; employees: number; remapped: number }> | null = null;

export async function rebuildAttendanceRange(
  from: Date,
  to: Date,
): Promise<{ rebuilt: number; employees: number; remapped: number }> {
  if (rebuildInFlight) return rebuildInFlight;
  rebuildInFlight = doRebuildAttendanceRange(from, to).finally(() => { rebuildInFlight = null; });
  return rebuildInFlight;
}

async function doRebuildAttendanceRange(
  from: Date,
  to: Date,
): Promise<{ rebuilt: number; employees: number; remapped: number }> {
  // Step 1: re-map orphaned punches (employeeId=null) across all history.
  const unmapped = await prisma.biometricPunch.findMany({
    where: { employeeId: null },
    select: { deviceUserId: true, punchedAt: true },
  });

  let remapped = 0;
  const remappedDays = new Map<string, { employeeId: string; date: Date }>();

  if (unmapped.length > 0) {
    const deviceUserIds = [...new Set(unmapped.map((p) => p.deviceUserId))];
    const userRows = await prisma.user.findMany({
      where: { biometricUserId: { in: deviceUserIds } },
      select: { id: true, biometricUserId: true },
    });
    const deviceToEmployee = new Map(userRows.map((u) => [u.biometricUserId!, u.id]));

    // One updateMany per distinct deviceUserId instead of one UPDATE per row.
    for (const [deviceUserId, employeeId] of deviceToEmployee.entries()) {
      const result = await prisma.biometricPunch.updateMany({
        where: { employeeId: null, deviceUserId },
        data: { employeeId, appliedAt: new Date() },
      });
      remapped += result.count;
    }

    for (const punch of unmapped) {
      const employeeId = deviceToEmployee.get(punch.deviceUserId);
      if (!employeeId) continue;
      const date = localDateOnly(punch.punchedAt);
      // Key on Dhaka calendar day, not date.toISOString(). Prisma can return
      // @db.Date columns as a Date whose UTC-instant is at Dhaka-midnight
      // instead of UTC-midnight — depending on the Node TZ and driver — so an
      // ISO-string key would mismatch between the write side (always UTC-mid)
      // and the read side, causing a P2002 unique-constraint violation when
      // the rebuild thought the row didn't exist and tried to createMany.
      remappedDays.set(`${employeeId}|${localDayKey(date)}`, { employeeId, date });
    }
  }

  // Step 2: collect (employee, day) pairs to rebuild.
  const rangePunches = await prisma.biometricPunch.findMany({
    where: { punchedAt: { gte: from, lt: to }, employeeId: { not: null } },
    select: { employeeId: true, punchedAt: true },
  });

  const dayMap = new Map<string, { employeeId: string; date: Date }>(remappedDays);
  for (const p of rangePunches) {
    if (!p.employeeId) continue;
    const date = localDateOnly(p.punchedAt);
    const key = `${p.employeeId}|${localDayKey(date)}`;
    if (!dayMap.has(key)) dayMap.set(key, { employeeId: p.employeeId, date });
  }

  if (dayMap.size === 0) {
    return { rebuilt: 0, employees: 0, remapped };
  }

  // Step 3: bulk-fetch settings + existing records + all relevant punches.
  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  const standardMinutes = standardMinutesFromWindow(settings.workStartTime, settings.workEndTime);

  const allEmployeeIds = [...new Set([...dayMap.values()].map((d) => d.employeeId))];
  const allDates = [...new Set([...dayMap.values()].map((d) => d.date.toISOString()))].map(
    (s) => new Date(s),
  );

  // Overall time window covering every day we'll rebuild.
  const minDate = allDates.reduce((a, b) => (a < b ? a : b));
  const maxDate = allDates.reduce((a, b) => (a > b ? a : b));
  const windowStart = localDayBounds(minDate.toISOString().slice(0, 10)).start;
  const windowEnd   = localDayBounds(maxDate.toISOString().slice(0, 10)).end;

  const [existingRecords, allPunches] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employeeId: { in: allEmployeeIds }, date: { in: allDates } },
      select: { id: true, employeeId: true, date: true, source: true },
    }),
    prisma.biometricPunch.findMany({
      where: {
        employeeId: { in: allEmployeeIds },
        punchedAt: { gte: windowStart, lt: windowEnd },
      },
      orderBy: { punchedAt: 'asc' },
      select: { employeeId: true, punchedAt: true },
    }),
  ]);

  const existingByKey = new Map<string, { id: string; source: string }>();
  for (const r of existingRecords) {
    existingByKey.set(`${r.employeeId}|${localDayKey(r.date)}`, { id: r.id, source: r.source });
  }

  const punchesByKey = new Map<string, Date[]>();
  for (const p of allPunches) {
    if (!p.employeeId) continue;
    const key = `${p.employeeId}|${localDayKey(p.punchedAt)}`;
    const arr = punchesByKey.get(key);
    if (arr) arr.push(p.punchedAt);
    else punchesByKey.set(key, [p.punchedAt]);
  }

  // Step 4: compute in-memory, then batch writes.
  const toCreate: Array<{
    employeeId: string; date: Date;
    clockInTime: Date; clockOutTime: Date | null;
    totalWorkedMinutes: number; overtimeMinutes: number; deficitMinutes: number;
    status: 'PRESENT'; source: 'BIOMETRIC';
  }> = [];
  const toUpdate: Array<{
    id: string;
    clockInTime: Date | null; clockOutTime: Date | null;
    totalWorkedMinutes: number; overtimeMinutes: number; deficitMinutes: number;
  }> = [];

  for (const { employeeId, date } of dayMap.values()) {
    const key = `${employeeId}|${localDayKey(date)}`;
    const dayPunches = punchesByKey.get(key);
    if (!dayPunches || dayPunches.length === 0) continue;

    const existing = existingByKey.get(key);
    if (existing && existing.source === 'MANUAL') continue;

    const { clockIn, clockOut } = resolveInOut(dayPunches);

    const totalWorkedMinutes = clockIn && clockOut
      ? Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000))
      : 0;

    const overtimeMinutes = clockOut ? Math.max(0, totalWorkedMinutes - standardMinutes) : 0;
    const deficitMinutes  = clockOut ? Math.max(0, standardMinutes - totalWorkedMinutes) : 0;

    // A day with only a lone late-afternoon punch has no clock-in — that row
    // is effectively a stand-alone clock-out. Prisma requires both `create`
    // and `update` payloads to include the resolved values.
    if (existing) {
      toUpdate.push({ id: existing.id, clockInTime: clockIn, clockOutTime: clockOut, totalWorkedMinutes, overtimeMinutes, deficitMinutes });
    } else if (clockIn) {
      // Skip creating a brand-new row when the resolver couldn't assign a
      // clock-in — the schema treats clockInTime as the anchor of a session,
      // and a solo clock-out with no in doesn't warrant a fresh record.
      toCreate.push({
        employeeId, date, clockInTime: clockIn, clockOutTime: clockOut,
        totalWorkedMinutes, overtimeMinutes, deficitMinutes, status: 'PRESENT', source: 'BIOMETRIC',
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.attendanceRecord.createMany({ data: toCreate });
  }
  for (const u of toUpdate) {
    await prisma.attendanceRecord.update({
      where: { id: u.id },
      data: {
        clockInTime: u.clockInTime,
        clockOutTime: u.clockOutTime,
        totalWorkedMinutes: u.totalWorkedMinutes,
        overtimeMinutes: u.overtimeMinutes,
        deficitMinutes: u.deficitMinutes,
        status: 'PRESENT',
        source: 'BIOMETRIC',
      },
    });
  }

  return {
    rebuilt: toCreate.length + toUpdate.length,
    employees: allEmployeeIds.length,
    remapped,
  };
}
