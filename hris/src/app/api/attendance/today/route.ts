import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api';

export async function GET() {
  const [user, error] = await requireAuth();
  if (error) return error;

  const today = new Date();
  const dateOnly = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const record = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: user.id, date: dateOnly } },
    include: { breaks: { orderBy: { breakStart: 'asc' } } },
  });

  return NextResponse.json({
    date: dateOnly.toISOString().slice(0, 10),
    record: record ? serialize(record) : null,
    isWeekend: [0, 6].includes(today.getUTCDay()),
  });
}

interface RecordWithBreaks {
  id: string; employeeId: string; date: Date;
  clockInTime: Date | null; clockOutTime: Date | null;
  totalWorkedMinutes: number; totalBreakMinutes: number; overtimeMinutes: number;
  status: string; source: string; notes: string | null;
  breaks: { id: string; breakStart: Date; breakEnd: Date | null; durationMinutes: number | null }[];
}

export function serialize(r: RecordWithBreaks) {
  return {
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    clockInTime: r.clockInTime?.toISOString() ?? null,
    clockOutTime: r.clockOutTime?.toISOString() ?? null,
    totalWorkedMinutes: r.totalWorkedMinutes,
    totalBreakMinutes: r.totalBreakMinutes,
    overtimeMinutes: r.overtimeMinutes,
    status: r.status,
    source: r.source,
    notes: r.notes,
    breaks: r.breaks.map((b) => ({
      id: b.id,
      start: b.breakStart.toISOString(),
      end: b.breakEnd?.toISOString() ?? null,
      durationMinutes: b.durationMinutes,
    })),
  };
}
