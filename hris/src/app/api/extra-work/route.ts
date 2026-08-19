import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, parseBody, err } from '@/lib/api';
import { CreateExtraWorkSchema } from '@/lib/validation';
import { extraWorkTypeLabel } from '@/lib/leave';
import { approvalRecipients } from '@/lib/routing';
import { notifyMany } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { extraWorkSubmittedEmail } from '@/emails/templates';

/**
 * GET /api/extra-work
 *   ?scope=mine (default) — own extra work logs
 *   ?scope=all / pending  — admin/HR only
 */
export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') ?? 'mine';

  if (scope === 'all' || scope === 'pending') {
    if (!['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role))
      return err(403, 'FORBIDDEN', 'Only admins and HR can view all extra work logs.');
    const logs = await prisma.extraWorkLog.findMany({
      where: scope === 'pending' ? { status: 'PENDING' } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: { id: true, fullName: true, email: true, role: true, department: true, avatarUrl: true },
        },
        reviewer: { select: { id: true, fullName: true } },
      },
    });
    return NextResponse.json(logs.map(serialize));
  }

  const logs = await prisma.extraWorkLog.findMany({
    where: { employeeId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { reviewer: { select: { id: true, fullName: true } } },
  });
  return NextResponse.json(logs.map(serialize));
}

/**
 * POST /api/extra-work — log an extra work day for approval.
 */
export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const [input, badReq] = await parseBody(req, CreateExtraWorkSchema);
  if (badReq) return badReq;

  const workDate = new Date(input.workDate + 'T00:00:00Z');
  if (workDate > new Date()) {
    return err(400, 'FUTURE_DATE', 'You can only log extra work you have already done.');
  }

  // One log per day per employee
  const existing = await prisma.extraWorkLog.findFirst({
    where: { employeeId: user.id, workDate },
  });
  if (existing)
    return err(
      409,
      'DUPLICATE',
      `You already have a ${existing.status.toLowerCase()} extra work log for ${input.workDate}.`
    );

  const created = await prisma.extraWorkLog.create({
    data: {
      employeeId: user.id,
      workDate,
      workType: input.workType,
      reason: input.reason,
      description: input.description,
    },
  });

  // Fan-out notifications + emails to approvers
  const allUsers = await prisma.user.findMany({ where: { isActive: true } });
  const { to, cc } = approvalRecipients(user, allUsers);

  await notifyMany(
    [...to, ...cc].map((u) => ({
      recipientId: u.id,
      type: 'EXTRA_WORK_PENDING' as const,
      title: `Extra work log from ${user.fullName}`,
      body: `${extraWorkTypeLabel(input.workType)} on ${input.workDate}`,
      referenceType: 'extra_work_log',
      referenceId: created.id,
    }))
  );

  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/admin/requests`;
  if (to.length > 0) {
    const reviewerName = to.length === 1 ? to[0].fullName : 'team';
    const { subject, html } = extraWorkSubmittedEmail(
      {
        employeeName: user.fullName,
        reviewerName,
        workDate: input.workDate,
        workType: extraWorkTypeLabel(input.workType),
        reason: input.reason,
        reviewUrl,
      },
      { senderName: settings.senderName }
    );
    void sendEmail({
      to: to.map((u) => u.email),
      cc: cc.map((u) => u.email),
      subject,
      html,
      referenceType: 'extra_work_log',
      referenceId: created.id,
    });
  }

  return NextResponse.json(serialize(created), { status: 201 });
}

interface RawLog {
  id: string;
  employeeId: string;
  workDate: Date;
  workType: 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON';
  reason: string;
  description: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNote: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employee?: {
    id: string; fullName: string; email: string; role: string;
    department: string | null; avatarUrl: string | null;
  };
  reviewer?: { id: string; fullName: string } | null;
}

function serialize(l: RawLog) {
  return {
    id: l.id,
    employeeId: l.employeeId,
    workDate: l.workDate.toISOString().slice(0, 10),
    workType: l.workType,
    reason: l.reason,
    description: l.description,
    status: l.status,
    adminNote: l.adminNote,
    reviewedById: l.reviewedById,
    reviewedAt: l.reviewedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    employee: l.employee,
    reviewer: l.reviewer,
  };
}
