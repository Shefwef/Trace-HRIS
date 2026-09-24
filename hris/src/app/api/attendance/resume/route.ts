import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { localDateOnly } from '@/lib/workday';

/**
 * POST /api/attendance/resume
 *
 * Undoes an accidental clock-out on today's session. Clears clockOutTime and
 * resets the derived totals — they'll be re-populated when the employee
 * clocks out again for real. Break sessions and clockInTime are preserved.
 *
 * Only the employee themselves can call this on their own record; and only
 * when there's an existing clockOutTime to undo.
 */
export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const dateOnly = localDateOnly(new Date());

  const record = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: user.id, date: dateOnly } },
  });
  if (!record) return err(404, 'NO_RECORD', 'No attendance record for today.');
  if (!record.clockInTime) return err(400, 'NOT_CLOCKED_IN', 'You have not clocked in today.');
  if (!record.clockOutTime) return err(400, 'NOT_CLOCKED_OUT', 'You are still clocked in — nothing to resume.');

  const priorClockOut = record.clockOutTime;

  await prisma.$transaction(async (tx) => {
    await tx.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockOutTime: null,
        totalWorkedMinutes: 0,
        overtimeMinutes: 0,
        deficitMinutes: 0,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'ATTENDANCE_RESUME',
        targetType: 'attendance_record',
        targetId: record.id,
        metadata: { priorClockOut: priorClockOut.toISOString() },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
