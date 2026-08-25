import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';
import { invalidatePermissionCache, ALL_PERMISSIONS } from '@/lib/permissions';
import { z } from 'zod';
import { Prisma, type Role } from '@prisma/client';

export async function GET(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;
  if (!actor.roles.includes('SUPER_ADMIN')) {
    return err(403, 'FORBIDDEN', 'Only Super Admins can view the permission matrix.');
  }

  const permissions = await prisma.rolePermission.findMany({
    orderBy: [{ role: 'asc' }, { permission: 'asc' }],
  });
  return NextResponse.json(permissions);
}

const PatchSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE']),
  // Constrained to the compiled catalog so a hand-crafted request can't write
  // rows for permission keys that nothing ever reads.
  permission: z.string().refine((p) => (ALL_PERMISSIONS as readonly string[]).includes(p), {
    message: 'Unknown permission key.',
  }),
  enabled: z.boolean(),
});

export async function PATCH(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;
  if (!actor.roles.includes('SUPER_ADMIN')) {
    return err(403, 'FORBIDDEN', 'Only Super Admins can edit permissions.');
  }

  const [input, badReq] = await parseBody(req, PatchSchema);
  if (badReq) return badReq;

  // The Super Admin row is immutable — the UI locks it, and so does the API,
  // otherwise the owner could revoke their own access and lock the org out.
  if (input.role === 'SUPER_ADMIN') {
    return err(
      400,
      'SUPER_ADMIN_LOCKED',
      'Super Admin permissions are fixed and cannot be changed.',
    );
  }

  const updated = await prisma.rolePermission.upsert({
    where: {
      role_permission: { role: input.role as Role, permission: input.permission },
    },
    update: {
      enabled: input.enabled,
      updatedById: actor.id,
    },
    create: {
      role: input.role as Role,
      permission: input.permission,
      enabled: input.enabled,
      updatedById: actor.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'PERMISSION_UPDATED',
      targetType: 'permission',
      targetId: `${input.role}:${input.permission}`,
      metadata: { enabled: input.enabled } satisfies Prisma.InputJsonValue,
    },
  });

  invalidatePermissionCache();
  return NextResponse.json({ ok: true, data: updated });
}
