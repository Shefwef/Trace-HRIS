import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  const { id } = await ctx.params;

  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) return err(404, 'NOT_FOUND', 'Leave request not found.');
  if (request.employeeId !== user.id)
    return err(403, 'FORBIDDEN', 'You can only cancel your own leave requests.');
  if (request.status !== 'PENDING')
    return err(409, 'ALREADY_DECIDED', `Cannot cancel a ${request.status.toLowerCase()} request.`);

  // Bundle-aware cancel: cancelling any row from a multi-type submission
  // cancels all sibling rows in the same bundle. The apply page treated
  // the bundle as a single submission, so cancel must treat it as a single
  // action too.
  const targets = request.bundleId
    ? await prisma.leaveRequest.findMany({
        where: { bundleId: request.bundleId, status: 'PENDING' },
      })
    : [request];

  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: user.id, cycleYear: year } },
  });

  await prisma.$transaction(async (tx) => {
    for (const t of targets) {
      const duration = Number(t.durationDays);
      await tx.leaveRequest.update({
        where: { id: t.id },
        data: { status: 'CANCELLED' },
      });

      if (balance && t.leaveType === 'CASUAL') {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { casualPending: { decrement: duration } },
        });
      } else if (balance && t.leaveType === 'SICK') {
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
          targetId: t.id,
          metadata: { duration, bundleId: t.bundleId },
        },
      });
    }
  });

  return NextResponse.json({ ok: true, cancelled: targets.length });
}
