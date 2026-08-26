import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { getCurrentLocation, getHistory, canViewEmployee } from '@/lib/workLocation';
import { dayKeyToDateOnly, localDayBounds, localDayKey } from '@/lib/workday';

/**
 * GET /api/work-location
 *   Current work location + recent history.
 *
 * Query params:
 *   employeeId  view someone else (requires view_all, or view_team for a report)
 *   from, to    yyyy-MM-dd history window, office-local (defaults to today only
 *               being unbounded — omit both for the last 200 events)
 */
export async function GET(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  const url = new URL(req.url);
  const employeeId = url.searchParams.get('employeeId') ?? actor.id;

  if (employeeId !== actor.id && !(await canViewEmployee(actor, employeeId))) {
    return err(403, 'FORBIDDEN', 'You do not have permission to view this location history.');
  }

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const range =
    from || to
      ? {
          from: from ? localDayBounds(from).start : undefined,
          // `to` is inclusive for the caller, so we take the end of that day.
          to: to ? localDayBounds(to).end : undefined,
        }
      : undefined;

  const [current, history] = await Promise.all([
    getCurrentLocation(employeeId),
    getHistory(employeeId, range),
  ]);

  return NextResponse.json({
    date: localDayKey(),
    employeeId,
    current: {
      type: current.type,
      clockInTime: current.clockInTime?.toISOString() ?? null,
      clockOutTime: current.clockOutTime?.toISOString() ?? null,
      attendanceId: current.attendanceId,
      open: current.open
        ? {
            id: current.open.id,
            eventType: current.open.eventType,
            placeName: current.open.placeName,
            formattedAddress: current.open.formattedAddress,
            latitude: current.open.latitude,
            longitude: current.open.longitude,
            purpose: current.open.purpose,
            startedAt: current.open.startedAt.toISOString(),
            minutesElapsed: Math.max(
              0,
              Math.round((Date.now() - current.open.startedAt.getTime()) / 60_000),
            ),
          }
        : null,
    },
    history: history.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      previousLocationType: e.previousLocationType,
      newLocationType: e.newLocationType,
      placeId: e.placeId,
      placeName: e.placeName,
      formattedAddress: e.formattedAddress,
      latitude: e.latitude,
      longitude: e.longitude,
      purpose: e.purpose,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt?.toISOString() ?? null,
      autoClosed: e.autoClosed,
      durationMinutes: e.endedAt
        ? Math.max(0, Math.round((e.endedAt.getTime() - e.startedAt.getTime()) / 60_000))
        : null,
      createdBy: e.createdBy,
      /** Set when an HR/Admin correction authored the row on the employee's behalf. */
      byOther: e.createdById !== e.employeeId,
      dayKey: localDayKey(e.startedAt),
    })),
    // Echoed so a caller filtering by month can confirm what the server used.
    range: range
      ? { from: from ? dayKeyToDateOnly(from).toISOString().slice(0, 10) : null, to }
      : null,
  });
}
