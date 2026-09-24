import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { CreateLeaveSchema, CreateLeaveBundleSchema, type AllocationEntryInput } from '@/lib/validation';
import { computeDurationDays, leaveTypeLabel, formatLeavePeriod } from '@/lib/leave';
import { approvalRecipients } from '@/lib/routing';
import { notifyMany } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { leaveSubmittedEmail } from '@/emails/templates';
import type { LeaveType, User } from '@prisma/client';

/**
 * GET /api/leaves/requests
 *   ?scope=mine (default) — own leave requests
 *   ?scope=all           — reviewers only: all requests, newest first
 *   ?scope=pending       — reviewers only: PENDING requests
 *
 * Admin / HR / Super Admin see every request. A Line Manager sees only the
 * requests of their assigned direct reports, which mirrors the authorization
 * rule enforced in canApproveRequest() on the approve/reject routes.
 */
export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') ?? 'mine';

  if (scope === 'all' || scope === 'pending') {
    const roles = user.roles.length > 0 ? user.roles : [user.role];
    const isFullReviewer =
      roles.includes('ADMIN') || roles.includes('HR') || roles.includes('SUPER_ADMIN');
    const isLineManager = roles.includes('LINE_MANAGER');
    if (!isFullReviewer && !isLineManager)
      return err(403, 'FORBIDDEN', 'You do not have permission to view other requests.');

    const requests = await prisma.leaveRequest.findMany({
      where: {
        ...(scope === 'pending' ? { status: 'PENDING' as const } : {}),
        // Team-scoped for Line Managers who hold no wider reviewer role
        ...(isFullReviewer ? {} : { employee: { lineManagerId: user.id } }),
      },
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
 * POST /api/leaves/requests — submit one leave request or a multi-type bundle.
 *
 * Payload shape is detected at parse time:
 *   • Legacy: { leaveType, startDate, endDate, isHalfDay, ..., reason, channels }
 *     Creates a single request. Existing entry points keep working unchanged.
 *   • Bundle: { items: [{ leaveType, perDayAllocation }...], reason, channels }
 *     Creates N requests sharing a bundleId. Used by the new Apply-for-leave page.
 *
 * Available to any authenticated user (including HR / Admin / Super Admin).
 * Approval routing depends on the applicant's role (see lib/routing.ts).
 */
export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  // Peek at the body once so we can route to the right schema; parseBody would
  // consume the stream. This mirrors how other endpoints handle union payloads.
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object')
    return err(400, 'BAD_REQUEST', 'Request body must be a JSON object.');

  if (Array.isArray((raw as { items?: unknown }).items)) {
    return handleBundle(user, raw);
  }

  const parsed = CreateLeaveSchema.safeParse(raw);
  if (!parsed.success) {
    return err(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid payload.');
  }
  const input = parsed.data;

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
  const { to, cc } = await approvalRecipients(user, allUsers, 'notifications.leave_pending');
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

// ─── Bundle handler ─────────────────────────────────

/**
 * Multi-type submit path. Each enabled leave type becomes its own LeaveRequest
 * row; all rows share a bundleId so approve/reject/cancel can cascade
 * atomically (see [id]/approve, [id]/reject routes).
 *
 * Balance is checked against the SUM of same-typed items in the payload — a
 * user cannot request 3 casual days across two items when only 2 are left.
 * Overlap is checked against the union of the days across all items in the
 * bundle: no single day may already sit on an active leave.
 */
async function handleBundle(
  user: User,
  raw: unknown,
) {
  const parsed = CreateLeaveBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return err(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid bundle payload.');
  }
  const input = parsed.data;

  // Every day must be unique across the whole bundle. Same-day-different-type
  // isn't meaningful (you can't be on casual AND sick the same morning).
  const seenDays = new Set<string>();
  for (const item of input.items) {
    for (const entry of item.perDayAllocation) {
      if (seenDays.has(entry.date))
        return err(409, 'DAY_COLLISION', `${entry.date} is used more than once in this submission.`);
      seenDays.add(entry.date);
    }
  }

  // Reject any day that falls on the BD weekend (Fri/Sat) or on a
  // public holiday — leave can only be spent on days the employee would
  // otherwise be working.
  const bundleDaysList = [...seenDays];
  const dow = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay();
  const wknd = bundleDaysList.find((d) => dow(d) === 5 || dow(d) === 6);
  if (wknd)
    return err(400, 'NON_WORKING_DAY', `${wknd} is a weekend — leave can't be requested on non-working days.`);
  const holidayRows = await prisma.holiday.findMany({
    where: { date: { in: bundleDaysList.map((d) => new Date(d + 'T00:00:00Z')) } },
    select: { date: true, name: true },
  });
  if (holidayRows.length > 0) {
    const h = holidayRows[0];
    return err(400, 'HOLIDAY_CLASH', `${h.date.toISOString().slice(0, 10)} is a public holiday (${h.name}) — already off.`);
  }

  // Validate against existing pending/approved requests. Any day in the
  // bundle that overlaps an existing active leave request is rejected.
  const bundleDays = [...seenDays].sort();
  const bundleMin = new Date(bundleDays[0] + 'T00:00:00Z');
  const bundleMax = new Date(bundleDays[bundleDays.length - 1] + 'T00:00:00Z');
  const overlappingRequests = await prisma.leaveRequest.findMany({
    where: {
      employeeId: user.id,
      status: { in: ['PENDING', 'APPROVED'] },
      NOT: [
        { endDate: { lt: bundleMin } },
        { startDate: { gt: bundleMax } },
      ],
    },
    select: { startDate: true, endDate: true, status: true },
  });
  for (const other of overlappingRequests) {
    for (const day of bundleDays) {
      const d = new Date(day + 'T00:00:00Z');
      if (d >= other.startDate && d <= other.endDate)
        return err(409, 'OVERLAP', `${day} overlaps another ${other.status.toLowerCase()} leave request.`);
    }
  }

  // Balance check per type — duration = count(FULL) + 0.5 * count(HALF_*)
  const year = new Date().getFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_cycleYear: { employeeId: user.id, cycleYear: year } },
  });
  if (!balance)
    return err(500, 'NO_BALANCE', 'No leave balance found for this cycle.');

  const perTypeDuration = new Map<LeaveType, number>();
  for (const item of input.items) {
    const d = durationFromAllocation(item.perDayAllocation);
    if (d <= 0)
      return err(400, 'ZERO_DURATION', `${item.leaveType.toLowerCase()} leave in this submission comes out to zero days.`);
    perTypeDuration.set(item.leaveType, d);
    const avail = availableFor(balance, item.leaveType);
    if (d > avail)
      return err(
        400,
        'INSUFFICIENT_BALANCE',
        `Only ${avail} day(s) of ${item.leaveType.toLowerCase()} leave available; requested ${d}.`,
      );
  }

  const bundleId = randomUUID();

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const item of input.items) {
      const duration = perTypeDuration.get(item.leaveType)!;
      const sorted = [...item.perDayAllocation].sort((a, b) => a.date.localeCompare(b.date));
      const startDate = new Date(sorted[0].date + 'T00:00:00Z');
      const endDate   = new Date(sorted[sorted.length - 1].date + 'T00:00:00Z');
      // Derive the legacy isHalfDay/halfDaySlot columns from the allocation
      // so old consumers (list, detail, admin queue) still read something
      // sensible while they migrate to perDayAllocation.
      const isHalfDay = sorted.length === 1 && sorted[0].slot !== 'FULL';
      const halfDaySlot: 'MORNING' | 'AFTERNOON' | null = isHalfDay
        ? sorted[0].slot === 'HALF_MORNING'
          ? 'MORNING'
          : 'AFTERNOON'
        : null;

      const row = await tx.leaveRequest.create({
        data: {
          employeeId: user.id,
          leaveType: item.leaveType,
          startDate,
          endDate,
          isHalfDay,
          halfDaySlot,
          durationDays: duration,
          reason: input.reason,
          description: input.description,
          attachmentUrl: input.attachmentUrl,
          channels: input.channels,
          customMessage: input.customMessage,
          bundleId,
          perDayAllocation: sorted as unknown as import('@prisma/client').Prisma.InputJsonValue,
        },
      });

      if (item.leaveType === 'CASUAL') {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { casualPending: { increment: duration } },
        });
      } else if (item.leaveType === 'SICK') {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { sickPending: { increment: duration } },
        });
      }
      rows.push(row);
    }
    return rows;
  });

  // Notifications + email — one per created row, matching the legacy path.
  // Admin review UI is untouched this iteration; bundling for the reviewer's
  // inbox is a follow-up.
  const allUsers = await prisma.user.findMany({ where: { isActive: true } });
  const { to, cc } = await approvalRecipients(user, allUsers, 'notifications.leave_pending');
  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/admin/requests`;

  for (const row of created) {
    const alloc = row.perDayAllocation as AllocationEntryInput[] | null;
    const period = alloc
      ? formatAllocationPeriod(alloc)
      : formatLeavePeriod(
          row.startDate.toISOString().slice(0, 10),
          row.endDate.toISOString().slice(0, 10),
          row.isHalfDay,
          row.halfDaySlot,
          row.timeFrom,
          row.timeTo,
        );
    const durationLabel = `${Number(row.durationDays)} day${Number(row.durationDays) === 1 ? '' : 's'}`;

    await notifyMany(
      [...to, ...cc].map((rid) => ({
        recipientId: rid.id,
        type: 'LEAVE_PENDING' as const,
        title: `Leave request from ${user.fullName}`,
        body: `${leaveTypeLabel(row.leaveType)} · ${period} · ${durationLabel}`,
        referenceType: 'leave_request',
        referenceId: row.id,
      })),
    );

    if (input.channels.includes('EMAIL') && to.length > 0) {
      const reviewerName = to.length === 1 ? to[0].fullName : 'team';
      const { subject, html } = leaveSubmittedEmail(
        {
          senderName: settings.senderName,
          employeeName: user.fullName,
          reviewerName,
          leaveType: leaveTypeLabel(row.leaveType),
          period,
          duration: durationLabel,
          reason: input.reason,
          description: input.description,
          reviewUrl,
        },
        { senderName: settings.senderName },
      );
      void sendEmail({
        to: to.map((u) => u.email),
        cc: cc.map((u) => u.email),
        subject,
        html,
        referenceType: 'leave_request',
        referenceId: row.id,
      });
    }
  }

  return NextResponse.json({ bundleId, items: created.map(serialize) }, { status: 201 });
}

function durationFromAllocation(alloc: AllocationEntryInput[]): number {
  let d = 0;
  for (const e of alloc) d += e.slot === 'FULL' ? 1 : 0.5;
  return d;
}

function formatAllocationPeriod(alloc: AllocationEntryInput[]): string {
  const sorted = [...alloc].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 1) {
    const e = sorted[0];
    const suffix =
      e.slot === 'HALF_MORNING' ? ' (morning half)'
      : e.slot === 'HALF_AFTERNOON' ? ' (afternoon half)'
      : '';
    return e.date + suffix;
  }
  return `${sorted[0].date} → ${sorted[sorted.length - 1].date}`;
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
  approvedAllocation: unknown;
  bundleId?: string | null;
  perDayAllocation?: unknown;
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
    approvedAllocation: r.approvedAllocation,
    bundleId: r.bundleId ?? null,
    perDayAllocation: r.perDayAllocation ?? null,
    reviewedById: r.reviewedById,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    employee: r.employee,
    reviewer: r.reviewer,
  };
}
