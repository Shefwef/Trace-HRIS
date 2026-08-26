import { NextResponse } from 'next/server';
import { requireAuth, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { CorrectWorkLocationSchema } from '@/lib/validation';
import { correctEvent, WorkLocationError } from '@/lib/workLocation';

/**
 * POST /api/work-location/correct
 *   HR/Admin fix for a bad record — usually an off-site period someone forgot
 *   to close. Appends an ADMIN_CORRECTION row; the original keeps its times, so
 *   the trail shows both what was recorded and who changed it.
 */
export async function POST(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  if (!(await checkPermission(actor, 'work_location.correct'))) {
    return err(403, 'FORBIDDEN', 'You do not have permission to correct location records.');
  }

  const [input, badReq] = await parseBody(req, CorrectWorkLocationSchema);
  if (badReq) return badReq;

  try {
    const result = await correctEvent({
      eventId: input.eventId,
      actorId: actor.id,
      note: input.note,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof WorkLocationError) return err(e.status, e.code, e.message);
    throw e;
  }
}
