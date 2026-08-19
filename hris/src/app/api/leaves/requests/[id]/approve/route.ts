import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, canApprove, err, parseBody } from '@/lib/api';
import { ApproveLeaveSchema } from '@/lib/validation';
import { leaveTypeLabel, formatLeavePeriod } from '@/lib/leave';
import { notify } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { leaveDecisionEmail } from '@/emails/templates';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth();
  if (error) return error;
  if (!canApprove(user.role))
    return err(403, 'FORBIDDEN', 'Only HR, Admin or Super Admin can approve.');

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, ApproveLeaveSchema);
  if (badReq) return badReq;

  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) return err(404, 'NOT_FOUND', 'Leave request not found.');
  if (request.status !== 'PENDING')
    return err(409, 'ALREADY_DECIDED', `Request is already ${request.status.toLowerCase()}.`);
  if (request.employeeId === user.id)
    return err(403, 'SELF_APPROVE', 'You cannot approve your own leave.');

  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: request.employeeId, cycleYear: year } },
  });
  if (!balance) return err(500, 'NO_BALANCE', 'Employee has no balance row for this cycle.');

  const duration = Number(request.durationDays);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const updatedRequest = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        adminNote: input.note,
        reviewedById: user.id,
        reviewedAt: now,
      },
    });

    if (request.leaveType === 'CASUAL') {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          casualUsed: { increment: duration },
          casualPending: { decrement: duration },
        },
      });
    } else if (request.leaveType === 'SICK') {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          sickUsed: { increment: duration },
          sickPending: { decrement: duration },
        },
      });
    } else {
      // REPLACEMENT — direct debit from the balance
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { replacementBalance: { decrement: duration } },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LEAVE_APPROVED',
        targetType: 'leave_request',
        targetId: id,
        metadata: { note: input.note ?? null, duration },
      },
    });

    return updatedRequest;
  });

  const period = formatLeavePeriod(
    updated.startDate.toISOString().slice(0, 10),
    updated.endDate.toISOString().slice(0, 10),
    updated.isHalfDay,
    updated.halfDaySlot,
    updated.timeFrom,
    updated.timeTo
  );
  const durationLabel = `${duration} day${duration === 1 ? '' : 's'}`;

  const employee = await prisma.user.findUnique({ where: { id: updated.employeeId } });
  const freshBalance = await prisma.leaveBalance.findUnique({ where: { id: balance.id } });
  const remaining =
    updated.leaveType === 'CASUAL'
      ? Number(freshBalance?.casualTotal ?? 0) - Number(freshBalance?.casualUsed ?? 0) - Number(freshBalance?.casualPending ?? 0)
      : updated.leaveType === 'SICK'
      ? Number(freshBalance?.sickTotal ?? 0) - Number(freshBalance?.sickUsed ?? 0) - Number(freshBalance?.sickPending ?? 0)
      : Number(freshBalance?.replacementBalance ?? 0);

  await notify({
    recipientId: updated.employeeId,
    type: 'LEAVE_APPROVED',
    title: 'Your leave was approved',
    body: `${user.fullName} approved your ${leaveTypeLabel(updated.leaveType)} for ${period}.`,
    referenceType: 'leave_request',
    referenceId: updated.id,
  });

  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  if (updated.channels.includes('EMAIL') && employee) {
    const historyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/leaves`;
    const { subject, html } = leaveDecisionEmail(
      {
        employeeName: employee.fullName,
        leaveType: leaveTypeLabel(updated.leaveType),
        period,
        duration: durationLabel,
        decision: 'APPROVED',
        reviewerName: user.fullName,
        note: input.note,
        remainingBalance: `${remaining} day${remaining === 1 ? '' : 's'}`,
        historyUrl,
      },
      { senderName: settings.senderName }
    );
    void sendEmail({
      to: [employee.email],
      subject,
      html,
      referenceType: 'leave_request',
      referenceId: updated.id,
    });
  }

  return NextResponse.json({ ok: true });
}
