import { NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { prisma } from '@/lib/db';
import { requireAuth, parseBody, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { UpdateEmployeeSchema } from '@/lib/validation';
import { primaryRole, validateRoleAssignment } from '@/lib/roles';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, UpdateEmployeeSchema);
  if (badReq) return badReq;

  // Granular permission checks
  const canRole = await checkPermission(actor, 'employee.assign_role');
  const canDeactivate = await checkPermission(actor, 'employee.deactivate');
  const canAssignLM = await checkPermission(actor, 'employee.assign_line_manager');
  const isSelf = id === actor.id;

  if (input.roles !== undefined && !canRole)
    return err(403, 'FORBIDDEN', 'You do not have permission to assign roles.');
  if (input.isActive !== undefined && !canDeactivate)
    return err(403, 'FORBIDDEN', 'You do not have permission to deactivate employees.');
  if (input.lineManagerId !== undefined && !canAssignLM)
    return err(403, 'FORBIDDEN', 'You do not have permission to assign line managers.');

  // Anyone can edit their own personal + employment details. The only fields
  // an employee cannot self-edit are joiningDate (drives the leave cycle),
  // roles, isActive, and lineManagerId — all of which have their own perm
  // checks above.
  const SELF_EDITABLE = new Set([
    'fullName', 'phone', 'dateOfBirth', 'avatarUrl',
    'employeeIdCode', 'designation', 'department',
  ]);
  if (isSelf && !canRole && !canDeactivate && !canAssignLM) {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      if (!SELF_EDITABLE.has(key)) {
        return err(
          403,
          'FORBIDDEN_FIELD',
          `You can only edit these fields on your own profile: ${[...SELF_EDITABLE].join(', ')}. Ask HR to change '${key}'.`,
        );
      }
    }
  } else if (!canRole && !canDeactivate && !canAssignLM) {
    return err(403, 'FORBIDDEN', 'You do not have permission to edit employees.');
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return err(404, 'NOT_FOUND', 'User not found.');

  // Only a Super Admin may change the roles or active status of another Super Admin account.
  const targetIsSA = existing.roles.includes('SUPER_ADMIN') || existing.role === 'SUPER_ADMIN';
  const actorIsSA = actor.roles.includes('SUPER_ADMIN') || actor.role === 'SUPER_ADMIN';
  if (targetIsSA && !actorIsSA && (input.roles !== undefined || input.isActive !== undefined)) {
    return err(
      403,
      'SUPER_ADMIN_PROTECTED',
      'Only a Super Admin can change the role or active status of another Super Admin account.',
    );
  }

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

  // If assigning a line manager, verify they exist and hold the LINE_MANAGER role
  if (input.lineManagerId) {
    const lm = await prisma.user.findUnique({ where: { id: input.lineManagerId } });
    if (!lm) return err(404, 'NOT_FOUND', 'Line manager not found.');
    if (!lm.roles.includes('LINE_MANAGER') && !lm.roles.includes('SUPER_ADMIN')) {
       // Super Admin can be a line manager in QA, but otherwise must have LINE_MANAGER role
      return err(400, 'INVALID_LINE_MANAGER', 'The assigned user does not hold the Line Manager role.');
    }
  }

  // Handle deactivation tracking fields
  let deactivatedAt = undefined;
  let deactivatedById = undefined;
  if (input.isActive === false && existing.isActive === true) {
    deactivatedAt = new Date();
    deactivatedById = actor.id;
  } else if (input.isActive === true && existing.isActive === false) {
    deactivatedAt = null;
    deactivatedById = null;
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
      lineManagerId: input.lineManagerId !== undefined ? input.lineManagerId : undefined,
      deactivatedAt: deactivatedAt !== undefined ? deactivatedAt : undefined,
      deactivatedById: deactivatedById !== undefined ? deactivatedById : undefined,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      joiningDate: input.joiningDate ? new Date(input.joiningDate) : undefined,
      avatarUrl: input.avatarUrl,
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
