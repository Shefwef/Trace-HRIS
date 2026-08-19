import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, parseBody, err } from '@/lib/api';
import { CreateLeaveSchema } from '@/lib/validation';
import { computeDurationDays, leaveTypeLabel, formatLeavePeriod } from '@/lib/leave';
import { approvalRecipients } from '@/lib/routing';
import { notifyMany } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { leaveSubmittedEmail } from '@/emails/templates';

/**
 * GET /api/leaves/requests
 *   ?scope=mine (default) — own leave requests
 *   ?scope=all           — admin/HR only: all requests, newest first
 *   ?scope=pending       — admin/HR only: PENDING requests
 */
export async function GET(req: Request) {
  const [user, error] = await requireAuth();
  if (error) return error;

  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') ?? 'mine';

  if (scope === 'all' || scope === 'pending') {
    if (!['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role))
      return err(403, 'FORBIDDEN', 'Only admins and HR can view all requests.');

    const requests = await prisma.leaveRequest.findMany({
      where: scope === 'pending' ? { status: 'PENDING' } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true, fullName: true, email: true, role: true,
            department: true, designation: true, avatarUrl: true,
          },
        },
        reviewer: { select: { id: true, fullName: true } },
      },
    });
    return NextResponse.json(requests.map(serialize));
  }

  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { reviewer: { select: { id: true, fullName: true } } },
  });
  return NextResponse.json(requests.map(serialize));
}

/**
 * POST /api/leaves/requests — submit a new leave request.
 * Available to any authenticated user (including HR / Admin / Super Admin).
 * Approval routing depends on the applicant's role (see lib/routing.ts).
 */
export async function POST(req: Request) {
  const [user, error] = await requireAuth();
  if (error) return error;

  const [input, badReq] = await parseBody(req, CreateLeaveSchema);
  if (badReq) return badReq;

  const duration = computeDurationDays(input);
  if (duration <= 0)
    return err(400, 'ZERO_DURATION', 'Leave duration comes out to zero days.');

  // Overlap check against pending/approved requests
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: user.id,
      status: { in: ['PENDING', 'APPROVED'] },
      NOT: {
        OR: [
          { endDate: { lt: new Date(input.startDate + 'T00:00:00Z') } },
          { startDate: { gt: new Date(input.endDate + 'T00:00:00Z') } },
        ],
      },
    },
  });
  if (overlap)
    return err(
      409,
      'OVERLAP',
      `This range overlaps another ${overlap.status.toLowerCase()} leave request.`
    );

  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: user.id, cycleYear: year } },
  });
  if (!balance)
    return err(500, 'NO_BALANCE', 'No leave balance found for this cycle.');

  // Validate against balance
  const available = availableFor(balance, input.leaveType);
  if (duration > available)
    return err(
      400,
      'INSUFFICIENT_BALANCE',
      `Only ${available} day(s) of ${input.leaveType.toLowerCase()} leave available; requested ${duration}.`
    );

  // Create request + reserve pending balance atomically
  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.create({
      data: {
        employeeId: user.id,
        leaveType: input.leaveType,
        startDate: new Date(input.startDate + 'T00:00:00Z'),
        endDate: new Date(input.endDate + 'T00:00:00Z'),
        isHalfDay: input.isHalfDay,
        halfDaySlot: input.halfDaySlot ?? null,
        timeFrom: input.timeFrom ?? null,
        timeTo: input.timeTo ?? null,
        durationDays: duration,
        reason: input.reason,
        description: input.description,
        channels: input.channels,
        customMessage: input.customMessage,
      },
    });

    if (input.leaveType === 'CASUAL') {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { casualPending: { increment: duration } },
      });
    } else if (input.leaveType === 'SICK') {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { sickPending: { increment: duration } },
      });
    }
    // REPLACEMENT balance holds no pending — it's a direct debit on approval

    return request;
  });

  // Fan out notifications + emails (outside DB tx; failures logged but don't roll back)
  const allUsers = await prisma.user.findMany({ where: { isActive: true } });
  const { to, cc } = approvalRecipients(user, allUsers);
  const period = formatLeavePeriod(
    input.startDate,
    input.endDate,
    input.isHalfDay,
    input.halfDaySlot,
    input.timeFrom,
    input.timeTo
  );
  const durationLabel = `${duration} day${duration === 1 ? '' : 's'}`;

  const notifRecipients = [...to, ...cc].map((u) => u.id);
  await notifyMany(
    notifRecipients.map((rid) => ({
      recipientId: rid,
      type: 'LEAVE_PENDING' as const,
      title: `Leave request from ${user.fullName}`,
      body: `${leaveTypeLabel(input.leaveType)} · ${period} · ${durationLabel}`,
      referenceType: 'leave_request',
      referenceId: created.id,
    }))
  );

  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/admin/requests`;
  if (input.channels.includes('EMAIL') && to.length > 0) {
    const reviewerName = to.length === 1 ? to[0].fullName : 'team';
    const { subject, html } = leaveSubmittedEmail(
      {
        senderName: settings.senderName,
        employeeName: user.fullName,
        reviewerName,
        leaveType: leaveTypeLabel(input.leaveType),
        period,
        duration: durationLabel,
        reason: input.reason,
        description: input.description,
        reviewUrl,
      },
      { senderName: settings.senderName }
    );
    // Fire-and-forget; do not fail the request if email fails
    void sendEmail({
      to: to.map((u) => u.email),
      cc: cc.map((u) => u.email),
      subject,
      html,
      referenceType: 'leave_request',
      referenceId: created.id,
    });
  }

  return NextResponse.json(serialize(created), { status: 201 });
}

// ─── helpers ─────────────────────────────────

function availableFor(b: {
  casualTotal: unknown; casualUsed: unknown; casualPending: unknown;
  sickTotal: unknown; sickUsed: unknown; sickPending: unknown;
  replacementBalance: unknown;
}, type: 'CASUAL' | 'SICK' | 'REPLACEMENT'): number {
  const n = (v: unknown) => Number(v);
  if (type === 'CASUAL') return n(b.casualTotal) - n(b.casualUsed) - n(b.casualPending);
  if (type === 'SICK') return n(b.sickTotal) - n(b.sickUsed) - n(b.sickPending);
  return n(b.replacementBalance);
}

interface RawRequest {
  id: string;
  employeeId: string;
  leaveType: 'CASUAL' | 'SICK' | 'REPLACEMENT';
  startDate: Date;
  endDate: Date;
  isHalfDay: boolean;
  halfDaySlot: 'MORNING' | 'AFTERNOON' | null;
  timeFrom: string | null;
  timeTo: string | null;
  durationDays: unknown;
  reason: string;
  description: string | null;
  attachmentUrl: string | null;
  channels: string[];
  customMessage: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  adminNote: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employee?: {
    id: string; fullName: string; email: string; role: string;
    department: string | null; designation: string | null; avatarUrl: string | null;
  };
  reviewer?: { id: string; fullName: string } | null;
}

function serialize(r: RawRequest) {
  return {
    id: r.id,
    employeeId: r.employeeId,
    leaveType: r.leaveType,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    isHalfDay: r.isHalfDay,
    halfDaySlot: r.halfDaySlot,
    timeFrom: r.timeFrom,
    timeTo: r.timeTo,
    durationDays: Number(r.durationDays),
    reason: r.reason,
    description: r.description,
    attachmentUrl: r.attachmentUrl,
    channels: r.channels,
    customMessage: r.customMessage,
    status: r.status,
    adminNote: r.adminNote,
    reviewedById: r.reviewedById,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    employee: r.employee,
    reviewer: r.reviewer,
  };
}
