import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { serialize } from '../today/route';

/**
 * GET /api/attendance/history?year=YYYY&month=MM  (mine)
 * GET /api/attendance/history?employeeId=...&year=YYYY&month=MM  (admin only)
 */
export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
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
    // Multi-role safe: prefer roles[] over the denormalized scalar role.
    const roles = user.roles?.length ? user.roles : [user.role];
    const isFullReviewer =
      roles.includes('ADMIN') ||
      roles.includes('HR') ||
      roles.includes('SUPER_ADMIN');
    if (!isFullReviewer) {
      // Line Managers see attendance for their DIRECT reports only —
      // non-transitive, matching how leave/extra-work approvals are scoped.
      if (!roles.includes('LINE_MANAGER'))
        return err(403, 'FORBIDDEN', 'You do not have permission to view another user\'s attendance.');
      const target = await prisma.user.findUnique({
        where: { id: otherId },
        select: { lineManagerId: true },
      });
      if (!target || target.lineManagerId !== user.id)
        return err(403, 'FORBIDDEN', 'You can only view attendance for your direct reports.');
    }
    targetId = otherId;
  }

  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const [target, records] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetId },
      select: { joiningDate: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { employeeId: targetId, date: { gte: from, lt: to } },
      orderBy: { date: 'asc' },
      include: {
        breaks: { orderBy: { breakStart: 'asc' } },
        locationEvents: { orderBy: { startedAt: 'asc' } },
      },
    }),
  ]);

  return NextResponse.json({
    year,
    month,
    joiningDate: target?.joiningDate ? target.joiningDate.toISOString().slice(0, 10) : null,
    records: records.map((r) => ({
      ...serialize(r),
      locationEvents: r.locationEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        newLocationType: e.newLocationType,
        placeName: e.placeName,
        formattedAddress: e.formattedAddress,
        purpose: e.purpose,
        startedAt: e.startedAt.toISOString(),
        endedAt: e.endedAt?.toISOString() ?? null,
        durationMinutes: e.endedAt
          ? Math.round((e.endedAt.getTime() - e.startedAt.getTime()) / 60_000)
          : null,
      })),
    })),
  });
}
