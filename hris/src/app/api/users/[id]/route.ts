import { NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { prisma } from '@/lib/db';
import { requireAuth, parseBody, err } from '@/lib/api';
import { UpdateEmployeeSchema } from '@/lib/validation';
import { canApproveLeave, primaryRole, validateRoleAssignment } from '@/lib/roles';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;
  if (!canApproveLeave(actor))
    return err(403, 'FORBIDDEN', 'Only HR, Admin or Super Admin can edit employees.');

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, UpdateEmployeeSchema);
  if (badReq) return badReq;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return err(404, 'NOT_FOUND', 'User not found.');

  // Prevent changing your own role set or deactivating yourself
  if (id === actor.id) {
    if (input.roles) {
      const currentSet = new Set(existing.roles.length > 0 ? existing.roles : [existing.role]);
      const nextSet = new Set(input.roles);
      const changed =
        currentSet.size !== nextSet.size ||
        [...currentSet].some((r) => !nextSet.has(r));
      if (changed)
        return err(400, 'SELF_ROLE_CHANGE', 'You cannot change your own roles.');
    }
    if (input.isActive === false)
      return err(400, 'SELF_DEACTIVATE', 'You cannot deactivate yourself.');
  }

  // Role-set hierarchy check
  if (input.roles) {
    const invalid = validateRoleAssignment(actor, input.roles);
    if (invalid) return err(403, 'ROLE_ELEVATION_FORBIDDEN', invalid);

    // Don't strip the last active Super Admin from the system
    if (existing.roles.includes('SUPER_ADMIN') && !input.roles.includes('SUPER_ADMIN')) {
      const superCount = await prisma.user.count({
        where: {
          isActive: true,
          roles: { has: 'SUPER_ADMIN' },
        },
      });
      if (superCount <= 1) {
        return err(
          400,
          'LAST_SUPER_ADMIN',
          'You cannot demote the only active Super Admin. Promote someone else first.',
        );
      }
    }
  }

  // If roles is being set, dedupe and derive the denormalized `role`
  // from the highest-ranked entry.
  const nextRoles = input.roles ? Array.from(new Set(input.roles)) : undefined;
  const nextPrimary = nextRoles ? primaryRole(nextRoles) : undefined;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      fullName: input.fullName,
      role: nextPrimary,
      roles: nextRoles,
      department: input.department,
      designation: input.designation,
      employeeIdCode: input.employeeIdCode,
      isActive: input.isActive,
    },
  });

  // Sync roles to Clerk metadata so future sessions carry the right set
  if (nextRoles) {
    try {
      await clerk.users.updateUser(id, {
        publicMetadata: {
          role: updated.role,
          roles: updated.roles,
          department: updated.department,
          designation: updated.designation,
          employeeIdCode: updated.employeeIdCode,
        },
      });
    } catch (e) {
      console.error('Clerk metadata sync failed:', e);
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'USER_UPDATED',
      targetType: 'user',
      targetId: id,
      metadata: {
        ...Object.fromEntries(
          Object.entries(input).filter(([, v]) => v !== undefined),
        ),
        previousRoles: existing.roles,
      } as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    ok: true,
    id: updated.id,
    role: updated.role,
    roles: updated.roles,
  });
}
