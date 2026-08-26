import { NextResponse } from 'next/server';
import { requireAuth, err, parseBody, isUniqueViolation } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { StartOffsiteSchema } from '@/lib/validation';
import { startOrChangeOffsite, WorkLocationError } from '@/lib/workLocation';

/**
 * POST /api/work-location/offsite
 *   Start an off-site work period, or move to a different destination if one is
 *   already open. Self-service only — HR does not set someone else's location
 *   here; corrections go through /api/work-location/correct.
 */
export async function POST(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  if (!(await checkPermission(actor, 'work_location.change_own'))) {
    return err(403, 'FORBIDDEN', 'You do not have permission to change your work location.');
  }

  const [input, badReq] = await parseBody(req, StartOffsiteSchema);
  if (badReq) return badReq;

  try {
    const result = await startOrChangeOffsite({
      employeeId: actor.id,
      actorId: actor.id,
      place: input,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof WorkLocationError) return err(e.status, e.code, e.message);
    // The partial unique index fires here if two requests race. Both callers
    // wanted the same thing, so report it as a conflict rather than a 500.
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
