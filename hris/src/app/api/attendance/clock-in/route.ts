import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';
import { localDateOnly } from '@/lib/workday';
import { openOfficePeriodOnClockIn } from '@/lib/workLocation';

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

  // Client typically POSTs with no body — the widget just wants "clock me in now."
  // Only try to parse if the request actually carries content.
  let input: z.infer<typeof Body> = undefined;
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > 0) {
    const [parsed, bad] = await parseBody(req, Body);
    if (bad) return bad;
    input = parsed;
  }

  const now = input?.timestamp ? new Date(input.timestamp) : new Date();
  // Office-local day, not the server's UTC day. A 07:30 Dhaka clock-in is
  // 01:30 UTC on the same date, but a 05:30 one is 23:30 UTC the day before —
  // deriving the key from UTC components filed those under yesterday.
  const dateOnly = localDateOnly(now);

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

  // One transaction: the attendance row, the OFFICE work-location baseline
  // (Rule 1 — every session starts in the office until the employee says
  // otherwise) and the audit entry either all land or none do.
  const record = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            clockInTime: now,
            status: 'PRESENT',
            source: input?.source ?? 'MANUAL',
            biometricDeviceId: input?.biometricDeviceId,
            workLocation: 'OFFICE',
          },
        })
      : await tx.attendanceRecord.create({
          data: {
            employeeId: user.id,
            date: dateOnly,
            clockInTime: now,
            status: 'PRESENT',
            source: input?.source ?? 'MANUAL',
            biometricDeviceId: input?.biometricDeviceId,
          },
        });

    await openOfficePeriodOnClockIn(tx, {
      employeeId: user.id,
      attendanceId: saved.id,
      at: now,
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CLOCK_IN',
        targetType: 'attendance_record',
        targetId: saved.id,
        metadata: { source: saved.source },
      },
    });

    return saved;
  });

  return NextResponse.json({ ok: true, at: now.toISOString(), workLocation: record.workLocation });
}
