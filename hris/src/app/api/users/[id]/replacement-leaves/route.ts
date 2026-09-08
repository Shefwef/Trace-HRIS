/**
 * GET /api/users/[id]/replacement-leaves
 *
 * Returns the target employee's replacement leaves (both employee-requested
 * and manager-granted), plus a current balance snapshot.
 *
 * Access rules:
 *   - Any user can view their own history
 *   - HR / Admin / Super Admin: any employee
 *   - Line Manager: only direct reports
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth();
  if (error) return error;

  const { id: targetId } = await ctx.params;
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, fullName: true, lineManagerId: true, isActive: true },
  });
  if (!target) return err(404, 'NOT_FOUND', 'Employee not found.');

  const isSelf = user.id === targetId;
  if (!isSelf) {
    const canViewOthers = await checkPermission(user, 'replacement.view_others');
    if (!canViewOthers)
      return err(403, 'FORBIDDEN', 'You do not have permission to view this employee\'s replacement leaves.');

    // Line Manager: enforce team scope (permission alone is not enough)
    const actorRoles = user.roles?.length ? user.roles : [user.role];
    const isFullReviewer =
      actorRoles.includes('ADMIN') ||
      actorRoles.includes('HR') ||
      actorRoles.includes('SUPER_ADMIN');
    if (!isFullReviewer && actorRoles.includes('LINE_MANAGER')) {
      if (target.lineManagerId !== user.id)
        return err(403, 'FORBIDDEN', 'You can only view replacement leaves for your team members.');
    }
  }

  const [leaves, balance] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { employeeId: targetId, leaveType: 'REPLACEMENT' },
      orderBy: { startDate: 'desc' },
      include: {
        reviewer: { select: { id: true, fullName: true } },
        grantedBy: { select: { id: true, fullName: true } },
      },
    }),
    prisma.leaveBalance.findUnique({
      where: {
        employeeId_cycleYear: {
          employeeId: targetId,
          cycleYear: new Date().getFullYear(),
        },
      },
      select: { replacementBalance: true },
    }),
  ]);

  return NextResponse.json({
    employee: { id: target.id, fullName: target.fullName },
    replacementBalance: Number(balance?.replacementBalance ?? 0),
    leaves: leaves.map((l) => ({
      id: l.id,
      startDate: l.startDate.toISOString().slice(0, 10),
      endDate: l.endDate.toISOString().slice(0, 10),
      isHalfDay: l.isHalfDay,
      halfDaySlot: l.halfDaySlot,
      durationDays: Number(l.durationDays),
      reason: l.reason,
      description: l.description,
      status: l.status,
      adminNote: l.adminNote,
      overtimeWorkDate: l.overtimeWorkDate
        ? l.overtimeWorkDate.toISOString().slice(0, 10)
        : null,
      source: l.grantedById ? 'GRANTED' : 'REQUESTED',
      grantedBy: l.grantedBy,
      reviewer: l.reviewer,
      reviewedAt: l.reviewedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
