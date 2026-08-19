import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { serialize } from '../today/route';

/**
 * GET /api/attendance/history?year=YYYY&month=MM  (mine)
 * GET /api/attendance/history?employeeId=...&year=YYYY&month=MM  (admin only)
 */
export async function GET(req: Request) {
  const [user, error] = await requireAuth();
  if (error) return error;

  const url = new URL(req.url);
  const yearP = url.searchParams.get('year');
  const monthP = url.searchParams.get('month');
  const otherId = url.searchParams.get('employeeId');

  const now = new Date();
  const year = yearP ? Number(yearP) : now.getUTCFullYear();
  const month = monthP ? Number(monthP) : now.getUTCMonth() + 1;
  if (!Number.isInteger(year) || year < 2000 || year > 3000)
    return err(400, 'BAD_YEAR', 'Invalid year.');
  if (!Number.isInteger(month) || month < 1 || month > 12)
    return err(400, 'BAD_MONTH', 'Invalid month.');

  let targetId = user.id;
  if (otherId && otherId !== user.id) {
    if (!['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role))
      return err(403, 'FORBIDDEN', 'Only admins can view another user\'s attendance.');
    targetId = otherId;
  }

  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const records = await prisma.attendanceRecord.findMany({
    where: { employeeId: targetId, date: { gte: from, lt: to } },
    orderBy: { date: 'asc' },
    include: { breaks: { orderBy: { breakStart: 'asc' } } },
  });

  return NextResponse.json({
    year,
    month,
    records: records.map(serialize),
  });
}
