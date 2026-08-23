import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, canApprove, err, parseBody } from '@/lib/api';
import { ApproveLeaveSchema } from '@/lib/validation';
import { extraWorkCredit, extraWorkTypeLabel } from '@/lib/leave';
import { notify } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { extraWorkDecisionEmail } from '@/emails/templates';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  if (!canApprove(user.role))
    return err(403, 'FORBIDDEN', 'Only HR, Admin or Super Admin can approve.');

  const { id } = await ctx.params;
  const [input, badReq] = await parseBody(req, ApproveLeaveSchema);
  if (badReq) return badReq;

  const log = await prisma.extraWorkLog.findUnique({ where: { id } });
  if (!log) return err(404, 'NOT_FOUND', 'Extra work log not found.');
  if (log.status !== 'PENDING')
    return err(409, 'ALREADY_DECIDED', `Log is already ${log.status.toLowerCase()}.`);

  const credit = extraWorkCredit(log.workType);
  const year = new Date().getFullYear();

  await prisma.$transaction(async (tx) => {
    await tx.extraWorkLog.update({
      where: { id },
      data: {
        status: 'APPROVED',
        adminNote: input.note,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });

    await tx.leaveBalance.upsert({
      where: {
        employeeId_cycleYear: { employeeId: log.employeeId, cycleYear: year },
      },
      create: {
        employeeId: log.employeeId,
        cycleYear: year,
        cycleStartDate: new Date(year, 0, 1),
        cycleEndDate: new Date(year, 11, 31),
        replacementBalance: credit,
      },
      update: { replacementBalance: { increment: credit } },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'EXTRA_WORK_APPROVED',
        targetType: 'extra_work_log',
        targetId: id,
        metadata: { credit, note: input.note ?? null },
      },
    });
  });

  const employee = await prisma.user.findUnique({ where: { id: log.employeeId } });
  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  await notify({
    recipientId: log.employeeId,
    type: 'EXTRA_WORK_APPROVED',
    title: 'Your extra work log was approved',
    body: `${user.fullName} approved your extra work day. You've earned ${credit} replacement leave day${credit === 1 ? '' : 's'}.`,
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
        decision: 'APPROVED',
        reviewerName: user.fullName,
        note: input.note,
        creditDays: credit,
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
