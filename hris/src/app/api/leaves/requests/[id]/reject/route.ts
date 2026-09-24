import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, canApproveRequest, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { RejectLeaveSchema } from '@/lib/validation';
import { leaveTypeLabel, formatLeavePeriod } from '@/lib/leave';
import { notifyIfPermitted } from '@/lib/notifications';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'leave.reject');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'You do not have permission to reject leaves.');

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, RejectLeaveSchema);
  if (badReq) return badReq;

  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) return err(404, 'NOT_FOUND', 'Leave request not found.');
  if (request.status !== 'PENDING')
    return err(409, 'ALREADY_DECIDED', `Request is already ${request.status.toLowerCase()}.`);

  if (user.id === request.employeeId)
    return err(403, 'SELF_REJECT', 'You cannot reject your own leave request.');

  const applicant = await prisma.user.findUnique({ where: { id: request.employeeId } });
  if (!applicant) return err(500, 'APPLICANT_MISSING', 'Applicant user not found.');
  const hierarchyError = canApproveRequest(user, applicant);
  if (hierarchyError) return err(403, 'HIERARCHY_VIOLATION', hierarchyError);

  // Bundle-aware: rejecting any row rejects every pending sibling too.
  const bundleSiblings = request.bundleId
    ? await prisma.leaveRequest.findMany({
        where: { bundleId: request.bundleId, status: 'PENDING', NOT: { id } },
      })
    : [];
  const allTargets = [request, ...bundleSiblings];

  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: request.employeeId, cycleYear: year } },
  });
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    for (const t of allTargets) {
      const dur = Number(t.durationDays);
      await tx.leaveRequest.update({
        where: { id: t.id },
        data: {
          status: 'REJECTED',
          adminNote: input.note,
          reviewedById: user.id,
          reviewedAt: now,
        },
      });

      if (balance && t.leaveType === 'CASUAL') {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { casualPending: { decrement: dur } },
        });
      } else if (balance && t.leaveType === 'SICK') {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { sickPending: { decrement: dur } },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'LEAVE_REJECTED',
          targetType: 'leave_request',
          targetId: t.id,
          metadata: { note: input.note, duration: dur, bundleId: t.bundleId },
        },
      });
    }

    return prisma.leaveRequest.findUnique({ where: { id } });
  });

  if (!updated) return err(500, 'MISSING_AFTER_UPDATE', 'Update returned no row.');

  const period = formatLeavePeriod(
    updated.startDate.toISOString().slice(0, 10),
    updated.endDate.toISOString().slice(0, 10),
    updated.isHalfDay,
    updated.halfDaySlot,
    updated.timeFrom,
    updated.timeTo,
  );

  await notifyIfPermitted(applicant, 'notifications.leave_decision', {
    type: 'LEAVE_REJECTED',
    title: 'Your leave was rejected',
    body: `${user.fullName} declined your ${leaveTypeLabel(updated.leaveType)} for ${period}. Reason: ${input.note}`,
    referenceType: 'leave_request',
    referenceId: updated.id,
  });

  return NextResponse.json({ ok: true, cascadedSiblings: bundleSiblings.length });
}
