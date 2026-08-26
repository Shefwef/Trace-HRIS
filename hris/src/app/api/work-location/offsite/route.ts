import { NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { requireAuth, err, parseBody, isUniqueViolation } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { StartOffsiteSchema } from '@/lib/validation';
import { startOrChangeOffsite, WorkLocationError } from '@/lib/workLocation';
import { prisma } from '@/lib/db';
import { notifyMany } from '@/lib/notifications';

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

    // Notify HR on new off-site starts (not location changes). Isolated in its
    // own try/catch so any DB hiccup here never surfaces to the employee.
    if (result.eventType === 'OFFSITE_STARTED') {
      void (async () => {
        try {
          const hrUsers = await prisma.user.findMany({
            where: { roles: { has: 'HR' as Role }, isActive: true, id: { not: actor.id } },
            select: { id: true },
          });
          if (hrUsers.length > 0) {
            const purposePart = input.purpose ? ` — ${input.purpose}` : '';
            await notifyMany(
              hrUsers.map((u) => ({
                recipientId: u.id,
                type: 'SYSTEM' as const,
                title: `${actor.fullName} started off-site work`,
                body: `${input.placeName}${purposePart}`,
                referenceType: 'work_location_event',
                referenceId: result.eventId,
              })),
            );
          }
        } catch {
          // Notification failure must never roll back or delay the location change.
        }
      })();
    }

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
