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
import { localDateOnly, localDayBounds } from './workday';

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

// ─── Time-of-day attendance rebuild ────────────────────────

/** Hour boundary between clock-in and clock-out. Matches ZKBioTime's setting. */
const CLOCK_OUT_HOUR = 11;
/** Standard workday, minutes; anything beyond this counts as overtime. */
const WORK_DAY_MINUTES = 8 * 60;

/** Local wall-clock hour (0–23) of a UTC instant in the given IANA zone. */
function getLocalHour(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, hour: '2-digit',
  }).formatToParts(at);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
}

/**
 * Recomputes one attendance record from every biometric punch belonging to
 * `employeeId` on the local `date`. Never touches MANUAL records.
 *
 * Rule: punches before 11:00 local are clock-in candidates, at/after are
 * clock-out candidates; clockIn = earliest candidate, clockOut = latest
 * candidate. Works even when only one class exists (single tap in the morning
 * gives just a clockIn; a single evening tap gives just a clockOut).
 */
async function rebuildAttendanceDay(
  employeeId: string,
  date: Date,
  deviceSerial: string | null,
  tz: string,
  isMock: boolean,
): Promise<void> {
  const dayKey = date.toISOString().slice(0, 10);
  const { start, end } = localDayBounds(dayKey);

  const allPunches = await prisma.biometricPunch.findMany({
    where: { employeeId, punchedAt: { gte: start, lt: end } },
    orderBy: { punchedAt: 'asc' },
    select: { punchedAt: true },
  });

  if (allPunches.length === 0) return;

  const clockIns  = allPunches.filter((p) => getLocalHour(p.punchedAt, tz) <  CLOCK_OUT_HOUR);
  const clockOuts = allPunches.filter((p) => getLocalHour(p.punchedAt, tz) >= CLOCK_OUT_HOUR);

  const clockIn  = clockIns[0]?.punchedAt  ?? null;
  const clockOut = clockOuts[clockOuts.length - 1]?.punchedAt ?? null;

  const totalWorkedMinutes = clockIn && clockOut
    ? Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000))
    : 0;
  const overtimeMinutes = Math.max(0, totalWorkedMinutes - WORK_DAY_MINUTES);

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
 */
export async function rebuildAttendanceRange(
  from: Date,
  to: Date,
): Promise<{ rebuilt: number; employees: number }> {
  const punches = await prisma.biometricPunch.findMany({
    where: { punchedAt: { gte: from, lt: to }, employeeId: { not: null } },
    select: { employeeId: true, punchedAt: true },
  });

  const dayMap = new Map<string, { employeeId: string; date: Date }>();
  for (const p of punches) {
    if (!p.employeeId) continue;
    const date = localDateOnly(p.punchedAt);
    const key = `${p.employeeId}|${date.toISOString()}`;
    if (!dayMap.has(key)) dayMap.set(key, { employeeId: p.employeeId, date });
  }

  for (const { employeeId, date } of dayMap.values()) {
    await rebuildAttendanceDay(employeeId, date, null, BIOMETRIC_TZ, false);
  }

  return {
    rebuilt: dayMap.size,
    employees: new Set([...dayMap.values()].map((v) => v.employeeId)).size,
  };
}
