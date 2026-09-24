import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';

/**
 * POST /api/users/[id]/restore
 * Reverses a soft-delete. The user stays deactivated (isActive=false) so
 * an admin still needs to re-activate them explicitly before they can log
 * in again — undo shouldn't accidentally re-grant access.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;
  const canDelete = await checkPermission(actor, 'employee.deactivate');
  if (!canDelete) return err(403, 'FORBIDDEN', 'You do not have permission to restore employees.');

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return err(404, 'NOT_FOUND', 'User not found.');
  if (!target.deletedAt) return err(400, 'NOT_DELETED', 'This employee is not in the deleted list.');

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'USER_RESTORED',
        targetType: 'user',
        targetId: id,
        metadata: { fullName: target.fullName, email: target.email },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
