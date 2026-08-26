import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { getLocationBoard, resolveVisibleEmployeeIds } from '@/lib/workLocation';
import { checkPermission } from '@/lib/permissions';
import { dayKeyToDateOnly, localDayKey } from '@/lib/workday';

/**
 * GET /api/work-location/board?date=yyyy-MM-dd
 *   Everyone's location for one day. HR/Admin see the whole company; a Line
 *   Manager sees their direct reports plus themselves. Anyone else gets 403 —
 *   this is the only endpoint that reveals other people's whereabouts.
 */
export async function GET(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  const scope = await resolveVisibleEmployeeIds(actor);
  if (scope === null) {
    return err(403, 'FORBIDDEN', 'You do not have permission to view the location board.');
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return err(400, 'BAD_DATE', 'date must be yyyy-MM-dd.');
  }
  const dayKey = dateParam ?? localDayKey();

  const rows = await getLocationBoard({
    date: dayKeyToDateOnly(dayKey),
    employeeIds: scope === 'ALL' ? undefined : scope,
  });

  const offsite = rows.filter((r) => r.locationType === 'OFFSITE').length;
  const present = rows.filter((r) => r.clockInTime !== null).length;

  return NextResponse.json({
    date: dayKey,
    scope: scope === 'ALL' ? 'ALL' : 'TEAM',
    // The screen hides its correction affordances when false. The correct route
    // re-checks this anyway — this is for the UI, not for security.
    canCorrect: await checkPermission(actor, 'work_location.correct'),
    totals: {
      employees: rows.length,
      present,
      // Counted directly rather than as `present - offsite`: a row can carry a
      // stale OFFSITE mirror with no clock-in for the day, and subtracting would
      // then under-report the office.
      inOffice: rows.filter((r) => r.clockInTime !== null && r.locationType === 'OFFICE')
        .length,
      offsite,
      notClockedIn: rows.length - present,
    },
    rows: rows.map((r) => ({
      ...r,
      clockInTime: r.clockInTime?.toISOString() ?? null,
      clockOutTime: r.clockOutTime?.toISOString() ?? null,
      startedAt: r.startedAt?.toISOString() ?? null,
      lastChangeAt: r.lastChangeAt?.toISOString() ?? null,
    })),
  });
}
