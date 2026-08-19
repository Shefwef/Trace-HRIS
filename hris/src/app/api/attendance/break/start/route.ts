import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const now = new Date();
  const dateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const record = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: user.id, date: dateOnly } },
    include: { breaks: true },
  });
  if (!record || !record.clockInTime)
    return err(400, 'NOT_CLOCKED_IN', 'You must clock in first.');
  if (record.clockOutTime)
    return err(409, 'ALREADY_CLOCKED_OUT', "You've already clocked out today.");
  if (record.breaks.some((b) => !b.breakEnd))
    return err(409, 'BREAK_IN_PROGRESS', 'A break is already in progress.');

  await prisma.breakSession.create({
    data: { attendanceId: record.id, breakStart: now },
  });

  return NextResponse.json({ ok: true, at: now.toISOString() });
}
