import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { dayKeyToDateOnly, localTimeOnDayToUtc } from '@/lib/workday';

/**
 * HR/Admin override for a missed biometric punch. Writes an AttendanceRecord
 * directly with source=MANUAL, so the biometric rebuild loop (which skips
 * MANUAL rows) will not overwrite it. Existing values on the day are
 * preserved when a field is left blank in the payload.
 */
const ManualPunchSchema = z
  .object({
    employeeId: z.string().min(1),
    /** YYYY-MM-DD, office-local. */
    date: z.iso.date(),
    /** HH:mm 24-hour, office-local. Either or both may be provided. */
    clockIn: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    clockOut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    /** Short reason (audit + surfaced in the notes field). */
    reason: z.string().min(3).max(200),
  })
  .refine((v) => v.clockIn || v.clockOut, {
    message: 'Provide a clock-in time, a clock-out time, or both.',
    path: ['clockIn'],
  })
  .refine((v) => !(v.clockIn && v.clockOut) || v.clockIn < v.clockOut, {
    message: 'Clock-out must be after clock-in.',
    path: ['clockOut'],
  });

export async function POST(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(actor, 'biometric.manage');
  if (!hasPerm)
    return err(403, 'FORBIDDEN', 'You do not have permission to record manual attendance.');

  const [input, bad] = await parseBody(req, ManualPunchSchema);
  if (bad) return bad;

  const employee = await prisma.user.findUnique({
    where: { id: input.employeeId },
    select: { id: true, fullName: true, isActive: true },
  });
  if (!employee) return err(404, 'NOT_FOUND', 'Employee not found.');

  const dateOnly = dayKeyToDateOnly(input.date);
  const clockInUtc  = input.clockIn  ? localTimeOnDayToUtc(input.date, input.clockIn)  : null;
  const clockOutUtc = input.clockOut ? localTimeOnDayToUtc(input.date, input.clockOut) : null;

  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date: dateOnly } },
  });

  const nextClockIn  = clockInUtc  ?? existing?.clockInTime  ?? null;
  const nextClockOut = clockOutUtc ?? existing?.clockOutTime ?? null;

  const totalWorkedMinutes = nextClockIn && nextClockOut
    ? Math.max(0, Math.round((nextClockOut.getTime() - nextClockIn.getTime()) / 60_000))
    : 0;

  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  const workEndUtc = localTimeOnDayToUtc(input.date, settings.workEndTime);
  const overtimeMinutes = nextClockOut && nextClockOut > workEndUtc
    ? Math.round((nextClockOut.getTime() - workEndUtc.getTime()) / 60_000)
    : 0;

  const noteLine = `Manual ${input.clockIn ? 'clock-in' : ''}${input.clockIn && input.clockOut ? '/' : ''}${input.clockOut ? 'clock-out' : ''} by ${actor.fullName}: ${input.reason}`;

  const saved = await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: employee.id, date: dateOnly } },
    create: {
      employeeId: employee.id,
      date: dateOnly,
      clockInTime: nextClockIn,
      clockOutTime: nextClockOut,
      totalWorkedMinutes,
      overtimeMinutes,
      status: 'PRESENT',
      source: 'MANUAL',
      notes: noteLine,
    },
    update: {
      clockInTime: nextClockIn,
      clockOutTime: nextClockOut,
      totalWorkedMinutes,
      overtimeMinutes,
      status: 'PRESENT',
      source: 'MANUAL',
      notes: existing?.notes ? `${existing.notes}\n${noteLine}` : noteLine,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'ATTENDANCE_MANUAL_OVERRIDE',
      targetType: 'attendance',
      targetId: saved.id,
      metadata: {
        employeeId: employee.id,
        date: input.date,
        clockIn: input.clockIn ?? null,
        clockOut: input.clockOut ?? null,
        reason: input.reason,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    id: saved.id,
    clockInTime: saved.clockInTime?.toISOString() ?? null,
    clockOutTime: saved.clockOutTime?.toISOString() ?? null,
    totalWorkedMinutes: saved.totalWorkedMinutes,
    overtimeMinutes: saved.overtimeMinutes,
  });
}
