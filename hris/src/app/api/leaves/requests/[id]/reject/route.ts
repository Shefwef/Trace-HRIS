import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, canApprove, err, parseBody } from '@/lib/api';
import { RejectLeaveSchema } from '@/lib/validation';
import { leaveTypeLabel, formatLeavePeriod } from '@/lib/leave';
import { notify } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { leaveDecisionEmail, customLeaveEmail } from '@/emails/templates';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  if (!canApprove(user.role))
    return err(403, 'FORBIDDEN', 'Only HR, Admin or Super Admin can reject.');

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, RejectLeaveSchema);
  if (badReq) return badReq;

  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) return err(404, 'NOT_FOUND', 'Leave request not found.');
  if (request.status !== 'PENDING')
    return err(409, 'ALREADY_DECIDED', `Request is already ${request.status.toLowerCase()}.`);

  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: request.employeeId, cycleYear: year } },
  });
  const duration = Number(request.durationDays);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const updatedRequest = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminNote: input.note,
        reviewedById: user.id,
        reviewedAt: now,
      },
    });

    // Release the pending reservation for CASUAL / SICK. REPLACEMENT holds no pending.
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
        action: 'LEAVE_REJECTED',
        targetType: 'leave_request',
        targetId: id,
        metadata: { note: input.note, duration },
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

  await notify({
    recipientId: updated.employeeId,
    type: 'LEAVE_REJECTED',
    title: 'Your leave was rejected',
    body: `${user.fullName} declined your ${leaveTypeLabel(updated.leaveType)} for ${period}. Reason: ${input.note}`,
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
    const useCustom = !!(input.emailSubject && input.emailBody);
    const { subject, html } = useCustom
      ? customLeaveEmail(
          {
            subject: input.emailSubject!,
            body: input.emailBody!,
            decision: 'REJECTED',
            historyUrl,
          },
          { senderName: settings.senderName },
        )
      : leaveDecisionEmail(
          {
            employeeName: employee.fullName,
            leaveType: leaveTypeLabel(updated.leaveType),
            period,
            duration: durationLabel,
            decision: 'REJECTED',
            reviewerName: user.fullName,
            note: input.note,
            historyUrl,
          },
          { senderName: settings.senderName },
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
