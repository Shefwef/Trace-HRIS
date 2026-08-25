import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { seedPermissionDefaults, invalidatePermissionCache } from '@/lib/permissions';

export async function POST(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;
  if (!actor.roles.includes('SUPER_ADMIN')) {
    return err(403, 'FORBIDDEN', 'Only Super Admins can reset permissions.');
  }

  // Wipe the entire matrix and re-seed
  await prisma.rolePermission.deleteMany({});
  const seeded = await seedPermissionDefaults();

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'PERMISSIONS_RESET',
      targetType: 'system',
      targetId: 'permissions',
    },
  });

  invalidatePermissionCache();
  return NextResponse.json({ ok: true, seeded });
}
