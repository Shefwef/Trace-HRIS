import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

export async function POST() {
  const [user, error] = await requireAuth();
  if (error) return error;

  const now = new Date();
  const dateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const record = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: user.id, date: dateOnly } },
    include: { breaks: true },
  });
  if (!record) return err(400, 'NO_SESSION', 'No active session today.');

  const openBreak = record.breaks.find((b) => !b.breakEnd);
  if (!openBreak) return err(409, 'NO_BREAK', 'No open break to end.');

  const dur = Math.round((now.getTime() - openBreak.breakStart.getTime()) / 60000);

  await prisma.$transaction(async (tx) => {
    await tx.breakSession.update({
      where: { id: openBreak.id },
      data: { breakEnd: now, durationMinutes: dur },
    });
    await tx.attendanceRecord.update({
      where: { id: record.id },
      data: { totalBreakMinutes: record.totalBreakMinutes + dur },
    });
  });

  return NextResponse.json({ ok: true, at: now.toISOString(), addedMinutes: dur });
}
