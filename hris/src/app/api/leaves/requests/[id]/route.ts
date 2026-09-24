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
          lineManagerId: true,
        },
      },
      reviewer: { select: { id: true, fullName: true } },
    },
  });
  if (!record) return err(404, 'NOT_FOUND', 'Leave request not found.');

  const isOwner = record.employeeId === user.id;
  // Multi-role safe: prefer roles[] over the denormalized scalar role.
  const roles = user.roles?.length ? user.roles : [user.role];
  const isFullReviewer =
    roles.includes('ADMIN') || roles.includes('HR') || roles.includes('SUPER_ADMIN');
  // Line managers may open request details for their DIRECT reports only —
  // non-transitive, same rule the approve/reject endpoints already enforce.
  const isDirectLineManager =
    roles.includes('LINE_MANAGER') && record.employee.lineManagerId === user.id;
  if (!isOwner && !isFullReviewer && !isDirectLineManager)
    return err(403, 'FORBIDDEN', 'Not allowed to view this request.');

  // Also send the employee's current balance for the review preview.
  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: record.employeeId, cycleYear: year } },
  });

  // If this row belongs to a multi-type bundle, fetch the sibling items so
  // the review drawer can render the combined breakdown + total.
  const bundleItems = record.bundleId
    ? await prisma.leaveRequest.findMany({
        where: { bundleId: record.bundleId },
        orderBy: { leaveType: 'asc' },
        select: {
          id: true, leaveType: true, startDate: true, endDate: true,
          isHalfDay: true, halfDaySlot: true, durationDays: true,
          status: true, perDayAllocation: true,
        },
      })
    : null;

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
    bundleId: record.bundleId ?? null,
    perDayAllocation: record.perDayAllocation ?? null,
    bundleItems: bundleItems
      ? bundleItems.map((b) => ({
          id: b.id,
          leaveType: b.leaveType,
          startDate: b.startDate.toISOString().slice(0, 10),
          endDate: b.endDate.toISOString().slice(0, 10),
          isHalfDay: b.isHalfDay,
          halfDaySlot: b.halfDaySlot,
          durationDays: Number(b.durationDays),
          status: b.status,
          perDayAllocation: b.perDayAllocation,
        }))
      : null,
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
