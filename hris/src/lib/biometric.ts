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
import { localDateOnly, localDayKey } from './workday';

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

  // 2. Filter to clock-in (0), clock-out (1), and unknown (255); parse times.
  //    Unknown punches ("255") are resolved via toggle: the second tap of the day
  //    becomes clock-out, the third becomes clock-in again, and so on. This matches
  //    the ZKTeco M2-LR at Trace, which sends "255" for all taps because it is not
  //    configured with explicit In/Out states.
  type ParsedPunch = {
    raw: RawPunch;
    punchedAtUtc: Date;
  };

  const valid: ParsedPunch[] = [];
  for (const p of input.punches) {
    if (p.punchState !== '0' && p.punchState !== '1' && p.punchState !== '255') continue;
    const punchedAtUtc = parsePunchTime(p.punchedAt, tz);
    if (!punchedAtUtc) { result.rejected++; continue; }
    valid.push({ raw: p, punchedAtUtc });
  }

  // Sort chronologically so within-batch toggle ordering is correct.
  valid.sort((a, b) => a.punchedAtUtc.getTime() - b.punchedAtUtc.getTime());

  // Resolve '255' punches: query the last stored state per employee from the DB,
  // then toggle within the batch. State only carries forward *within a single
  // Dhaka day* — after midnight the toggle resets, so the first tap of a new
  // day is always a clock-in even if yesterday's clock-out was missed.
  const ids255 = [...new Set(
    valid.filter((p) => p.raw.punchState === '255').map((p) => p.raw.deviceUserId),
  )];
  const stateMap = new Map<string, '0' | '1'>();
  if (ids255.length > 0) {
    const lastRows = await prisma.biometricPunch.findMany({
      where: { deviceId: device.id, deviceUserId: { in: ids255 }, punchState: { in: ['0', '1'] } },
      orderBy: { punchedAt: 'desc' },
      distinct: ['deviceUserId'],
      select: { deviceUserId: true, punchState: true, punchedAt: true },
    });
    const todayKey = localDayKey();
    for (const row of lastRows) {
      // Only inherit state if the last punch was today (Dhaka time). A punch
      // from yesterday shouldn't leak into today's toggle — a new day starts fresh.
      if (localDayKey(row.punchedAt) === todayKey) {
        stateMap.set(row.deviceUserId, row.punchState as '0' | '1');
      }
    }
  }

  const parsed: ParsedPunch[] = [];
  for (const punch of valid) {
    let resolvedState: string = punch.raw.punchState;
    if (punch.raw.punchState === '255') {
      // No state today → default to '1' so toggle gives '0' (clock-in) — first tap of new day.
      const last = stateMap.get(punch.raw.deviceUserId) ?? '1';
      resolvedState = last === '0' ? '1' : '0';
      stateMap.set(punch.raw.deviceUserId, resolvedState as '0' | '1');
    } else {
      stateMap.set(punch.raw.deviceUserId, punch.raw.punchState as '0' | '1');
    }
    parsed.push({ raw: { ...punch.raw, punchState: resolvedState }, punchedAtUtc: punch.punchedAtUtc });
  }

  if (parsed.length === 0) {
    await prisma.biometricSyncLog.create({
      data: {
        deviceId: device.id,
        received: result.received,
      },
    });
    return result;
  }

  // 3. Upsert punches — the unique index on (deviceId, deviceUserId, punchedAt)
  //    makes duplicates a no-op. We use createMany with skipDuplicates.
  const toInsert = parsed.map((p) => ({
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

  result.duplicates = parsed.length - createResult.count;
  const newPunches = createResult.count; // actual rows inserted

  if (newPunches === 0) {
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

  // 4. Map deviceUserId → User.biometricUserId for newly-inserted punches.
  //    We need to re-fetch the inserted rows to get their ids.
  const newPunchRows = await prisma.biometricPunch.findMany({
    where: {
      deviceId: device.id,
      punchedAt: { in: parsed.map((p) => p.punchedAtUtc) },
      appliedAt: null,
    },
  });

  // Build a mapping cache: deviceUserId -> employeeId (or null)
  const deviceUserIds = [...new Set(newPunchRows.map((r) => r.deviceUserId))];
  const userRows = await prisma.user.findMany({
    where: { biometricUserId: { in: deviceUserIds } },
    select: { id: true, biometricUserId: true },
  });
  const deviceToEmployee = new Map(
    userRows.map((u) => [u.biometricUserId!, u.id]),
  );

  // 5. For each new punch, assign employeeId and apply to attendance.
  //    Group by (employeeId, local date) to compute min-In / max-Out.
  type AttendanceKey = string; // `${employeeId}|${dateKey}`
  const byEmployeeDay = new Map<AttendanceKey, { clockIn: Date | null; clockOut: Date | null }>();

  for (const punch of newPunchRows) {
    const employeeId = deviceToEmployee.get(punch.deviceUserId) ?? null;

    // Update the punch row with the resolved employeeId
    await prisma.biometricPunch.update({
      where: { id: punch.id },
      data: { employeeId, appliedAt: employeeId ? new Date() : null },
    });

    if (!employeeId) { result.unmapped++; continue; }

    const dateKey = localDateOnly(punch.punchedAt);
    const mapKey: AttendanceKey = `${employeeId}|${dateKey.toISOString()}`;
    const existing = byEmployeeDay.get(mapKey) ?? { clockIn: null, clockOut: null };

    if (punch.punchState === '0') {
      existing.clockIn =
        !existing.clockIn || punch.punchedAt < existing.clockIn
          ? punch.punchedAt
          : existing.clockIn;
    } else if (punch.punchState === '1') {
      existing.clockOut =
        !existing.clockOut || punch.punchedAt > existing.clockOut
          ? punch.punchedAt
          : existing.clockOut;
    }

    byEmployeeDay.set(mapKey, existing);
    result.applied++;
  }

  // 6. Write attendance records — one upsert per (employee, day).
  //    Manual corrections (source = MANUAL) win; biometric never overwrites them.
  for (const [key, times] of byEmployeeDay) {
    const [employeeId, dateIso] = key.split('|');
    const date = new Date(dateIso);

    const existing = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });

    const data: Record<string, unknown> = {
      source: input.isMock ? 'MOCK' : 'BIOMETRIC',
      biometricDeviceId: device.serial,
    };

    if (times.clockIn) {
      // Only overwrite if no manual clock-in exists
      if (!existing || !existing.clockInTime || existing.source !== 'MANUAL') {
        data.clockInTime = times.clockIn;
        data.status = 'PRESENT';
      }
    }
    if (times.clockOut) {
      if (!existing || !existing.clockOutTime || existing.source !== 'MANUAL') {
        data.clockOutTime = times.clockOut;
      }
    }

    if (existing) {
      await prisma.attendanceRecord.update({
        where: { id: existing.id },
        data,
      });
    } else if (times.clockIn) {
      await prisma.attendanceRecord.create({
        data: {
          employeeId,
          date,
          clockInTime: times.clockIn,
          clockOutTime: times.clockOut ?? undefined,
          status: 'PRESENT',
          source: input.isMock ? 'MOCK' : 'BIOMETRIC',
          biometricDeviceId: device.serial,
        },
      });
    }
  }

  // 7. Write sync log
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
