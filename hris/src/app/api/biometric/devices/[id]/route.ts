import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';

const PatchSchema = z.object({
  alias: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  const hasPerm = await checkPermission(user, 'biometric.manage');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.manage required.');

  const { id } = await ctx.params;
  const [input, bad] = await parseBody(req, PatchSchema);
  if (bad) return bad;

  const device = await prisma.biometricDevice.findUnique({ where: { id } });
  if (!device) return err(404, 'NOT_FOUND', 'Device not found.');

  const updated = await prisma.biometricDevice.update({
    where: { id },
    data: input,
  });

  return NextResponse.json({ ok: true, isActive: updated.isActive, alias: updated.alias });
}
