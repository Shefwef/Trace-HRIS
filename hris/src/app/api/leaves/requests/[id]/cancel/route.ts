import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth();
  if (error) return error;
  const { id } = await ctx.params;

  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) return err(404, 'NOT_FOUND', 'Leave request not found.');
  if (request.employeeId !== user.id)
    return err(403, 'FORBIDDEN', 'You can only cancel your own leave requests.');
  if (request.status !== 'PENDING')
    return err(409, 'ALREADY_DECIDED', `Cannot cancel a ${request.status.toLowerCase()} request.`);

  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: user.id, cycleYear: year } },
  });
  const duration = Number(request.durationDays);

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    if (balance && request.leaveType === 'CASUAL') {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { casualPending: { decrement: duration } },
      });
    } else if (balance && request.leaveType === 'SICK') {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { sickPending: { decrement: duration } },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LEAVE_CANCELLED',
        targetType: 'leave_request',
        targetId: id,
        metadata: { duration },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
