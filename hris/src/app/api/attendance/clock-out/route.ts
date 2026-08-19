import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';

const Body = z
  .object({
    source: z.enum(['MANUAL', 'BIOMETRIC']).optional(),
    biometricDeviceId: z.string().optional(),
    timestamp: z.iso.datetime().optional(),
  })
  .optional();

/**
 * POST /api/attendance/clock-out
 *   Ends the current session. Auto-closes any open break session.
 *   Computes worked minutes + break minutes + overtime beyond 8h.
 */
export async function POST(req: Request) {
  const [user, error] = await requireAuth();
  if (error) return error;

  let input: z.infer<typeof Body> = undefined;
  try {
    if (req.body) {
      const [parsed, bad] = await parseBody(req, Body);
      if (bad) return bad;
      input = parsed;
    }
  } catch {
    /* empty */
  }

  const now = input?.timestamp ? new Date(input.timestamp) : new Date();
  const dateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

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
  const standardMinutes = settings.standardHoursPerDay * 60;

  // Close any open break
  const openBreak = record.breaks.find((b) => !b.breakEnd);
  let addedBreakMinutes = 0;
  if (openBreak) {
    const dur = Math.round((now.getTime() - openBreak.breakStart.getTime()) / 60000);
    addedBreakMinutes = dur;
    await prisma.breakSession.update({
      where: { id: openBreak.id },
      data: { breakEnd: now, durationMinutes: dur },
    });
  }

  const totalBreakMinutes = record.totalBreakMinutes + addedBreakMinutes;
  const rawMinutes = Math.round((now.getTime() - record.clockInTime.getTime()) / 60000);
  const totalWorkedMinutes = Math.max(0, rawMinutes - totalBreakMinutes);
  const overtimeMinutes = Math.max(0, totalWorkedMinutes - standardMinutes);

  await prisma.$transaction(async (tx) => {
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
        metadata: { totalWorkedMinutes, overtimeMinutes, totalBreakMinutes },
      },
    });
  });

  return NextResponse.json({
    ok: true,
    at: now.toISOString(),
    summary: { totalWorkedMinutes, overtimeMinutes, totalBreakMinutes },
  });
}
