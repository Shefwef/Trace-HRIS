import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

/** GET one leave request (must be owner or admin/HR). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth();
  if (error) return error;
  const { id } = await ctx.params;

  const req = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, email: true, role: true,
          department: true, designation: true, avatarUrl: true, employeeIdCode: true,
        },
      },
      reviewer: { select: { id: true, fullName: true } },
    },
  });
  if (!req) return err(404, 'NOT_FOUND', 'Leave request not found.');

  const isOwner = req.employeeId === user.id;
  const isAdminTier = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role);
  if (!isOwner && !isAdminTier)
    return err(403, 'FORBIDDEN', 'Not allowed to view this request.');

  // Also send the employee's current balance for the review preview.
  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: req.employeeId, cycleYear: year } },
  });

  return NextResponse.json({
    id: req.id,
    employeeId: req.employeeId,
    leaveType: req.leaveType,
    startDate: req.startDate.toISOString().slice(0, 10),
    endDate: req.endDate.toISOString().slice(0, 10),
    isHalfDay: req.isHalfDay,
    halfDaySlot: req.halfDaySlot,
    timeFrom: req.timeFrom,
    timeTo: req.timeTo,
    durationDays: Number(req.durationDays),
    reason: req.reason,
    description: req.description,
    attachmentUrl: req.attachmentUrl,
    channels: req.channels,
    customMessage: req.customMessage,
    status: req.status,
    adminNote: req.adminNote,
    reviewedAt: req.reviewedAt?.toISOString() ?? null,
    createdAt: req.createdAt.toISOString(),
    employee: req.employee,
    reviewer: req.reviewer,
    balancePreview: balance
      ? {
          casualLeft: Number(balance.casualTotal) - Number(balance.casualUsed) - Number(balance.casualPending),
          sickLeft: Number(balance.sickTotal) - Number(balance.sickUsed) - Number(balance.sickPending),
          replacementLeft: Number(balance.replacementBalance),
        }
      : null,
  });
}
