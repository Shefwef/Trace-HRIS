import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

/** GET one leave request (must be owner or admin/HR). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  const { id } = await ctx.params;

  const record = await prisma.leaveRequest.findUnique({
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
  if (!record) return err(404, 'NOT_FOUND', 'Leave request not found.');

  const isOwner = record.employeeId === user.id;
  const isAdminTier = ['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role);
  if (!isOwner && !isAdminTier)
    return err(403, 'FORBIDDEN', 'Not allowed to view this request.');

  // Also send the employee's current balance for the review preview.
  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: record.employeeId, cycleYear: year } },
  });

  return NextResponse.json({
    id: record.id,
    employeeId: record.employeeId,
    leaveType: record.leaveType,
    startDate: record.startDate.toISOString().slice(0, 10),
    endDate: record.endDate.toISOString().slice(0, 10),
    isHalfDay: record.isHalfDay,
    halfDaySlot: record.halfDaySlot,
    timeFrom: record.timeFrom,
    timeTo: record.timeTo,
    durationDays: Number(record.durationDays),
    reason: record.reason,
    description: record.description,
    attachmentUrl: record.attachmentUrl,
    channels: record.channels,
    customMessage: record.customMessage,
    status: record.status,
    adminNote: record.adminNote,
    approvedAllocation: record.approvedAllocation,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    employee: record.employee,
    reviewer: record.reviewer,
    balancePreview: balance
      ? {
          casualLeft: Number(balance.casualTotal) - Number(balance.casualUsed) - Number(balance.casualPending),
          sickLeft: Number(balance.sickTotal) - Number(balance.sickUsed) - Number(balance.sickPending),
          replacementLeft: Number(balance.replacementBalance),
        }
      : null,
  });
}
