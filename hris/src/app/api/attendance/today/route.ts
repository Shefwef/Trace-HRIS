import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api';
import { localDateOnly, localDayKey, isNonWorkingDay } from '@/lib/workday';

export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const today = new Date();
  const dateOnly = localDateOnly(today);

  const [record, settings] = await Promise.all([
    prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: user.id, date: dateOnly } },
      include: { breaks: { orderBy: { breakStart: 'asc' } } },
    }),
    prisma.systemSettings.findUnique({
      where: { id: 'singleton' },
      select: { workDaysBitmask: true },
    }),
  ]);

  return NextResponse.json({
    date: localDayKey(today),
    record: record ? serialize(record) : null,
    // Bangladesh weekend is Friday + Saturday, driven by the configured
    // bitmask rather than the hardcoded Sun/Sat pair this used to assume.
    isWeekend: isNonWorkingDay(today, settings?.workDaysBitmask ?? 31),
  });
}

interface RecordWithBreaks {
  id: string; employeeId: string; date: Date;
  clockInTime: Date | null; clockOutTime: Date | null;
  totalWorkedMinutes: number; totalBreakMinutes: number; overtimeMinutes: number;
  deficitMinutes: number;
  status: string; source: string; notes: string | null;
  workLocation: string;
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
    deficitMinutes: r.deficitMinutes,
    status: r.status,
    source: r.source,
    notes: r.notes,
    workLocation: r.workLocation,
    breaks: r.breaks.map((b) => ({
      id: b.id,
      start: b.breakStart.toISOString(),
      end: b.breakEnd?.toISOString() ?? null,
      durationMinutes: b.durationMinutes,
    })),
  };
}
