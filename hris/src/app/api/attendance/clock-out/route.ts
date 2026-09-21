import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';
import { localDateOnly, localDayKey, localTimeOnDayToUtc } from '@/lib/workday';
import { closeOpenPeriodOnClockOut } from '@/lib/workLocation';

const Body = z
  .object({
    source: z.enum(['MANUAL', 'BIOMETRIC']).optional(),
    biometricDeviceId: z.string().optional(),
    timestamp: z.iso.datetime().optional(),
  })
  .optional();

/**
 * POST /api/attendance/clock-out
 *   Ends the current session. Auto-closes any open break session. Computes
 *   worked minutes + break minutes + overtime beyond the office end-of-day.
 */
export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  let input: z.infer<typeof Body> = undefined;
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > 0) {
    const [parsed, bad] = await parseBody(req, Body);
    if (bad) return bad;
    input = parsed;
  }

  const now = input?.timestamp ? new Date(input.timestamp) : new Date();
  const dateOnly = localDateOnly(now);

  const record = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: user.id, date: dateOnly } },
    include: { breaks: true },
  });
  if (!record || !record.clockInTime)
    return err(400, 'NOT_CLOCKED_IN', 'You are not currently clocked in.');
  if (record.clockOutTime)
    return err(409, 'ALREADY_CLOCKED_OUT', "You've already clocked out today.");

  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  // Close any open break. Computed here, written inside the transaction below
  // so a failure can't leave a closed break on a still-open session.
  const openBreak = record.breaks.find((b) => !b.breakEnd);
  const addedBreakMinutes = openBreak
    ? Math.round((now.getTime() - openBreak.breakStart.getTime()) / 60000)
    : 0;

  const totalBreakMinutes = record.totalBreakMinutes + addedBreakMinutes;
  const rawMinutes = Math.round((now.getTime() - record.clockInTime.getTime()) / 60000);
  const totalWorkedMinutes = Math.max(0, rawMinutes - totalBreakMinutes);

  // Overtime = time worked past the office end-of-day (settings.workEndTime),
  // not "worked beyond 8h". Someone clocking out at 6:30 PM when workEndTime
  // is 17:30 gets exactly 1h of overtime regardless of arrival time.
  const workEndUtc = localTimeOnDayToUtc(localDayKey(now), settings.workEndTime);
  const overtimeMinutes = now > workEndUtc
    ? Math.round((now.getTime() - workEndUtc.getTime()) / 60_000)
    : 0;

  const location = await prisma.$transaction(async (tx) => {
    if (openBreak) {
      await tx.breakSession.update({
        where: { id: openBreak.id },
        data: { breakEnd: now, durationMinutes: addedBreakMinutes },
      });
    }

    // Rule 7 — clock-out closes whatever work-location period is open. If the
    // employee was still off-site, the period is flagged autoClosed rather than
    // rewritten to pretend they came back.
    const closed = await closeOpenPeriodOnClockOut(tx, { employeeId: user.id, at: now });

    await tx.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockOutTime: now,
        totalBreakMinutes,
        totalWorkedMinutes,
        overtimeMinutes,
        source: input?.source ?? record.source,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CLOCK_OUT',
        targetType: 'attendance_record',
        targetId: record.id,
        metadata: {
          totalWorkedMinutes,
          overtimeMinutes,
          totalBreakMinutes,
          endedAtLocation: closed.endedAt,
          offsiteAutoClosed: closed.autoClosed,
        },
      },
    });

    return closed;
  });

  return NextResponse.json({
    ok: true,
    at: now.toISOString(),
    summary: { totalWorkedMinutes, overtimeMinutes, totalBreakMinutes },
    // The card uses this to warn "you were still marked off-site" on clock-out.
    location: { endedAt: location.endedAt, autoClosed: location.autoClosed },
  });
}
