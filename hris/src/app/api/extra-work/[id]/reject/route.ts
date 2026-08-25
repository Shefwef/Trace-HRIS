import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, canApproveRequest, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { RejectLeaveSchema } from '@/lib/validation';
import { extraWorkTypeLabel } from '@/lib/leave';
import { notifyIfPermitted } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { extraWorkDecisionEmail } from '@/emails/templates';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'extra_work.reject');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'You do not have permission to reject extra work.');

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, RejectLeaveSchema);
  if (badReq) return badReq;

  const log = await prisma.extraWorkLog.findUnique({ where: { id } });
  if (!log) return err(404, 'NOT_FOUND', 'Extra work log not found.');
  if (log.status !== 'PENDING')
    return err(409, 'ALREADY_DECIDED', `Log is already ${log.status.toLowerCase()}.`);

  // Self-rejection guard
  if (user.id === log.employeeId)
    return err(403, 'SELF_REJECT', 'You cannot reject your own extra work log.');

  // Hierarchical authorization check
  const applicant = await prisma.user.findUnique({ where: { id: log.employeeId } });
  if (!applicant) return err(500, 'APPLICANT_MISSING', 'Applicant user not found.');
  const hierarchyError = canApproveRequest(user, applicant);
  if (hierarchyError) return err(403, 'HIERARCHY_VIOLATION', hierarchyError);

  await prisma.$transaction(async (tx) => {
    await tx.extraWorkLog.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminNote: input.note,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'EXTRA_WORK_REJECTED',
        targetType: 'extra_work_log',
        targetId: id,
        metadata: { note: input.note },
      },
    });
  });

  const employee = await prisma.user.findUnique({ where: { id: log.employeeId } });
  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  await notifyIfPermitted(applicant, 'notifications.leave_decision', {
    type: 'EXTRA_WORK_REJECTED',
    title: 'Your extra work log was rejected',
    body: `${user.fullName} declined your log for ${log.workDate.toISOString().slice(0, 10)}. Reason: ${input.note}`,
    referenceType: 'extra_work_log',
    referenceId: id,
  });

  if (employee) {
    const historyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/attendance`;
    const { subject, html } = extraWorkDecisionEmail(
      {
        employeeName: employee.fullName,
        workDate: log.workDate.toISOString().slice(0, 10),
        workType: extraWorkTypeLabel(log.workType),
        decision: 'REJECTED',
        reviewerName: user.fullName,
        note: input.note,
        historyUrl,
      },
      { senderName: settings.senderName }
    );
    void sendEmail({
      to: [employee.email],
      subject,
      html,
      referenceType: 'extra_work_log',
      referenceId: id,
    });
  }

  return NextResponse.json({ ok: true });
}
