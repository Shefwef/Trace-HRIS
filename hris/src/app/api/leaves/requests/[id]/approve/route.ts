import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAuth, canApproveRequest, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { ApproveLeaveSchema } from '@/lib/validation';
import {
  leaveTypeLabel,
  formatLeavePeriod,
  computeDurationFromAllocation,
  slotShort,
  type AllocationEntry,
} from '@/lib/leave';
import { notifyIfPermitted } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { leaveDecisionEmail, customLeaveEmail } from '@/emails/templates';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'leave.approve');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'You do not have permission to approve leaves.');

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, ApproveLeaveSchema);
  if (badReq) return badReq;

  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) return err(404, 'NOT_FOUND', 'Leave request not found.');
  if (request.status !== 'PENDING')
    return err(409, 'ALREADY_DECIDED', `Request is already ${request.status.toLowerCase()}.`);

  // Self-approval guard (reinstated for production)
  if (user.id === request.employeeId)
    return err(403, 'SELF_APPROVE', 'You cannot approve your own leave request.');

  // Hierarchical authorization check
  const applicant = await prisma.user.findUnique({ where: { id: request.employeeId } });
  if (!applicant) return err(500, 'APPLICANT_MISSING', 'Applicant user not found.');
  const hierarchyError = canApproveRequest(user, applicant);
  if (hierarchyError) return err(403, 'HIERARCHY_VIOLATION', hierarchyError);

  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: request.employeeId, cycleYear: year } },
  });
  if (!balance) return err(500, 'NO_BALANCE', 'Employee has no balance row for this cycle.');

  const originalDuration = Number(request.durationDays);
  const finalDuration = input.allocation
    ? computeDurationFromAllocation(input.allocation)
    : originalDuration;

  if (finalDuration <= 0)
    return err(400, 'ZERO_DURATION', 'Approved allocation totals zero days.');

  // Balance check for the FINAL duration (only for CASUAL/SICK; REPLACEMENT is a direct debit)
  if (request.leaveType === 'CASUAL' || request.leaveType === 'SICK') {
    const b = balance;
    const total = request.leaveType === 'CASUAL' ? Number(b.casualTotal) : Number(b.sickTotal);
    const used = request.leaveType === 'CASUAL' ? Number(b.casualUsed) : Number(b.sickUsed);
    const pending = request.leaveType === 'CASUAL' ? Number(b.casualPending) : Number(b.sickPending);
    // Available = total - used - (pending excluding this request's reservation)
    const availableForModifiedApproval = total - used - (pending - originalDuration);
    if (finalDuration > availableForModifiedApproval)
      return err(
        400,
        'INSUFFICIENT_BALANCE',
        `The modified allocation (${finalDuration}) exceeds the employee's available ${request.leaveType.toLowerCase()} balance.`
      );
  }
  if (request.leaveType === 'REPLACEMENT' && finalDuration > Number(balance.replacementBalance))
    return err(
      400,
      'INSUFFICIENT_BALANCE',
      `The modified allocation (${finalDuration}) exceeds the employee's replacement leave balance.`
    );

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const updatedRequest = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        adminNote: input.note,
        reviewedById: user.id,
        reviewedAt: now,
        durationDays: finalDuration,
        approvedAllocation: input.allocation
          ? (input.allocation as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    if (request.leaveType === 'CASUAL') {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          casualUsed: { increment: finalDuration },
          casualPending: { decrement: originalDuration },
        },
      });
    } else if (request.leaveType === 'SICK') {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          sickUsed: { increment: finalDuration },
          sickPending: { decrement: originalDuration },
        },
      });
    } else {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { replacementBalance: { decrement: finalDuration } },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LEAVE_APPROVED',
        targetType: 'leave_request',
        targetId: id,
        metadata: {
          note: input.note ?? null,
          originalDuration,
          finalDuration,
          modified: !!input.allocation,
          allocation: input.allocation ?? null,
        },
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
  const durationLabel = `${finalDuration} day${finalDuration === 1 ? '' : 's'}`;

  const employee = await prisma.user.findUnique({ where: { id: updated.employeeId } });
  const freshBalance = await prisma.leaveBalance.findUnique({ where: { id: balance.id } });
  const remaining =
    updated.leaveType === 'CASUAL'
      ? Number(freshBalance?.casualTotal ?? 0) - Number(freshBalance?.casualUsed ?? 0) - Number(freshBalance?.casualPending ?? 0)
      : updated.leaveType === 'SICK'
      ? Number(freshBalance?.sickTotal ?? 0) - Number(freshBalance?.sickUsed ?? 0) - Number(freshBalance?.sickPending ?? 0)
      : Number(freshBalance?.replacementBalance ?? 0);

  const wasModified = !!input.allocation;
  const allocationSummary = input.allocation
    ? input.allocation
        .map((e: AllocationEntry) => `${e.date} — ${slotShort(e.slot)}`)
        .join('\n')
    : undefined;

  // Notify applicant of the decision
  await notifyIfPermitted(applicant, 'notifications.leave_decision', {
    type: 'LEAVE_APPROVED',
    title: wasModified ? 'Your leave was approved (with adjustments)' : 'Your leave was approved',
    body: wasModified
      ? `${user.fullName} approved your ${leaveTypeLabel(updated.leaveType)} for ${period}, adjusted to ${durationLabel}.`
      : `${user.fullName} approved your ${leaveTypeLabel(updated.leaveType)} for ${period}.`,
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
    // Prefer the reviewer's edited email (subject + body) when provided;
    // otherwise fall back to the auto-generated template.
    const useCustom = !!(input.emailSubject && input.emailBody);
    const { subject, html } = useCustom
      ? customLeaveEmail(
          {
            subject: input.emailSubject!,
            body: input.emailBody!,
            decision: 'APPROVED',
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
            decision: 'APPROVED',
            reviewerName: user.fullName,
            note: wasModified
              ? `${input.note ? input.note + '\n\n' : ''}Approved allocation:\n${allocationSummary}`
              : input.note,
            remainingBalance: `${remaining} day${remaining === 1 ? '' : 's'}`,
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

  return NextResponse.json({ ok: true, finalDuration, modified: wasModified });
}
