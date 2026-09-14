/**
 * Auto clock-out cron — runs once per day at 23:55 Dhaka (17:55 UTC).
 *
 * If an employee clocked in but never clocked out (forgot, device missed it,
 * etc.), this sets their clock-out to 23:59 of that day so attendance records
 * are never left open. Manual corrections always win — only BIOMETRIC source
 * records without a clock-out are touched.
 *
 * Vercel invokes this with Authorization: Bearer <CRON_SECRET> automatically.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { localDayKey, APP_TZ } from '@/lib/workday';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = localDayKey();
  const [y, m, d] = today.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(y, m - 1, d));
  const tomorrowUtc = new Date(Date.UTC(y, m - 1, d + 1));

  // 23:59:00 Dhaka on today's date → subtract 6h offset to get UTC
  const endOfDayDhaka = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  // Build 23:59:00 in Dhaka as a UTC Date
  const autoClockOut = new Date(
    new Date(`${today}T23:59:00`).getTime() - 6 * 60 * 60 * 1000,
  );

  const records = await prisma.attendanceRecord.findMany({
    where: {
      date: { gte: todayUtc, lt: tomorrowUtc },
      clockInTime: { not: null },
      clockOutTime: null,
      source: { not: 'MANUAL' },
    },
    select: { id: true },
  });

  if (records.length > 0) {
    await prisma.attendanceRecord.updateMany({
      where: { id: { in: records.map((r) => r.id) } },
      data: { clockOutTime: autoClockOut },
    });
  }

  return NextResponse.json({ updated: records.length, date: today, clockOutTime: autoClockOut });
}
