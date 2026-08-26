import { NextResponse } from 'next/server';
import { requireAuth, err, isUniqueViolation } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { returnToOffice, WorkLocationError } from '@/lib/workLocation';

/**
 * POST /api/work-location/return
 *   Mark the employee back in the office, closing the open off-site period.
 *   No body — the destination they are returning *from* is whatever is open.
 */
export async function POST(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  if (!(await checkPermission(actor, 'work_location.change_own'))) {
    return err(403, 'FORBIDDEN', 'You do not have permission to change your work location.');
  }

  try {
    const result = await returnToOffice({ employeeId: actor.id, actorId: actor.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof WorkLocationError) return err(e.status, e.code, e.message);
    if (isUniqueViolation(e)) {
      return err(
        409,
        'LOCATION_CHANGE_IN_FLIGHT',
        'Another location change is already being recorded. Refresh and try again.',
      );
    }
    throw e;
  }
}
