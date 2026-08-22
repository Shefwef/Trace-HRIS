import { NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { prisma } from '@/lib/db';
import { requireAuth, canApprove, parseBody, err } from '@/lib/api';
import { UpdateEmployeeSchema } from '@/lib/validation';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;
  if (!canApprove(actor.role))
    return err(403, 'FORBIDDEN', 'Only HR, Admin or Super Admin can edit employees.');

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, UpdateEmployeeSchema);
  if (badReq) return badReq;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return err(404, 'NOT_FOUND', 'User not found.');

  // Prevent lowering your own role or deactivating yourself
  if (id === actor.id) {
    if (input.role && input.role !== actor.role)
      return err(400, 'SELF_ROLE_CHANGE', 'You cannot change your own role.');
    if (input.isActive === false)
      return err(400, 'SELF_DEACTIVATE', 'You cannot deactivate yourself.');
  }

  // Role-assignment hierarchy:
  //   SUPER_ADMIN / ADMIN can assign any role.
  //   HR can only assign HR or EMPLOYEE — never ADMIN or SUPER_ADMIN.
  //   (EMPLOYEE never reaches this point — canApprove() above rejects.)
  if (input.role) {
    const hrAllowed = ['HR', 'EMPLOYEE'] as const;
    if (actor.role === 'HR' && !hrAllowed.includes(input.role as typeof hrAllowed[number])) {
      return err(
        403,
        'ROLE_ELEVATION_FORBIDDEN',
        'HR users can only assign HR or Employee roles. Ask an Admin or Super Admin to promote further.',
      );
    }
    // Guard: don't accidentally demote the only Super Admin
    if (existing.role === 'SUPER_ADMIN' && input.role !== 'SUPER_ADMIN') {
      const superCount = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', isActive: true },
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

  const updated = await prisma.user.update({
    where: { id },
    data: {
      fullName: input.fullName,
      role: input.role,
      department: input.department,
      designation: input.designation,
      employeeIdCode: input.employeeIdCode,
      isActive: input.isActive,
    },
  });

  // Sync role to Clerk metadata so future sessions carry the right role
  if (input.role) {
    try {
      await clerk.users.updateUser(id, {
        publicMetadata: {
          role: input.role,
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
      metadata: Object.fromEntries(
        Object.entries(input).filter(([, v]) => v !== undefined)
      ) as unknown as import('@prisma/client').Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true });
}
