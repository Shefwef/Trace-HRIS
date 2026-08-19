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

export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  let input: z.infer<typeof Body> = undefined;
  try {
    if (req.body) {
      const [parsed, bad] = await parseBody(req, Body);
      if (bad) return bad;
      input = parsed;
    }
  } catch {
    // no body — accept as manual clock-in
  }

  const now = input?.timestamp ? new Date(input.timestamp) : new Date();
  const dateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Weekend hint is exposed via GET /attendance/today (isWeekend). We do NOT
  // block clock-in on weekends — users might work Saturdays occasionally, and
  // the compensation path is the extra-work log.

  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: user.id, date: dateOnly } },
  });
  if (existing?.clockInTime && !existing.clockOutTime)
    return err(409, 'ALREADY_CLOCKED_IN', 'You are already clocked in.');
  if (existing?.clockOutTime)
    return err(409, 'ALREADY_CLOCKED_OUT', "You've already completed today's session.");

  const record = existing
    ? await prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          clockInTime: now,
          status: 'PRESENT',
          source: input?.source ?? 'MANUAL',
          biometricDeviceId: input?.biometricDeviceId,
        },
      })
    : await prisma.attendanceRecord.create({
        data: {
          employeeId: user.id,
          date: dateOnly,
          clockInTime: now,
          status: 'PRESENT',
          source: input?.source ?? 'MANUAL',
          biometricDeviceId: input?.biometricDeviceId,
        },
      });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'CLOCK_IN',
      targetType: 'attendance_record',
      targetId: record.id,
      metadata: { source: record.source },
    },
  });

  return NextResponse.json({ ok: true, at: now.toISOString() });
}
