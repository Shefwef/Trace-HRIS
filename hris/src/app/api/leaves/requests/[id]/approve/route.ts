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
  type AllocationEntry,
} from '@/lib/leave';
import { notifyIfPermitted } from '@/lib/notifications';

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

  if (user.id === request.employeeId)
    return err(403, 'SELF_APPROVE', 'You cannot approve your own leave request.');

  const applicant = await prisma.user.findUnique({ where: { id: request.employeeId } });
  if (!applicant) return err(500, 'APPLICANT_MISSING', 'Applicant user not found.');
  const hierarchyError = canApproveRequest(user, applicant);
  if (hierarchyError) return err(403, 'HIERARCHY_VIOLATION', hierarchyError);

  // Bundle-aware: approving any row from a multi-type submission approves
  // every sibling row in the same bundle atomically. `input.allocation`
  // only applies to the row that was explicitly targeted; sibling rows
  // keep their original per-day allocation.
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
  if (!balance) return err(500, 'NO_BALANCE', 'Employee has no balance row for this cycle.');

  // Resolve the effective allocation + duration for each target row.
  //   • If `bundleAllocations[t.id]` is set → use that per-item allocation.
  //   • Else if this is the target row AND `input.allocation` is set → use it.
  //   • Else → approve as-submitted, no allocation change.
  const effectiveFor = (t: typeof request): AllocationEntry[] | null => {
    if (input.bundleAllocations && input.bundleAllocations[t.id]) {
      return input.bundleAllocations[t.id] as AllocationEntry[];
    }
    if (t.id === id && input.allocation) {
      return input.allocation as AllocationEntry[];
    }
    return null;
  };
  const durationFor = (t: typeof request): number => {
    const alloc = effectiveFor(t);
    return alloc ? computeDurationFromAllocation(alloc) : Number(t.durationDays);
  };

  const finalDuration = durationFor(request);
  if (finalDuration <= 0)
    return err(400, 'ZERO_DURATION', 'Approved allocation totals zero days.');

  // Per-type balance check across every target row.
  const b = balance;
  const availableAfter = new Map<string, number>();
  availableAfter.set('CASUAL',      Number(b.casualTotal) - Number(b.casualUsed) - Number(b.casualPending));
  availableAfter.set('SICK',        Number(b.sickTotal)   - Number(b.sickUsed)   - Number(b.sickPending));
  availableAfter.set('REPLACEMENT', Number(b.replacementBalance));

  for (const t of allTargets) {
    const dur = durationFor(t);
    if (dur <= 0)
      return err(400, 'ZERO_DURATION', `Approved allocation for ${t.leaveType.toLowerCase()} totals zero days.`);
    const key = t.leaveType;
    if (key === 'REPLACEMENT') {
      const avail = availableAfter.get('REPLACEMENT')!;
      if (dur > avail) {
        return err(400, 'INSUFFICIENT_BALANCE', `Approving ${dur} day(s) of replacement leave exceeds the balance (${avail}).`);
      }
      availableAfter.set('REPLACEMENT', avail - dur);
    } else {
      const reservedByThis = Number(t.durationDays); // already in `pending`
      const avail = availableAfter.get(key)! + reservedByThis;
      if (dur > avail) {
        return err(400, 'INSUFFICIENT_BALANCE', `Approving ${dur} day(s) of ${key.toLowerCase()} leave exceeds the balance (${avail}).`);
      }
      availableAfter.set(key, avail - dur);
    }
  }

  const now = new Date();

  // Every date across every approved target row that should flip ABSENT → LEAVE.
  const absenceDates: Date[] = allTargets.flatMap((t) => {
    const alloc = effectiveFor(t);
    if (alloc) return alloc.map((a) => new Date(a.date));
    const dates: Date[] = [];
    const end = new Date(t.endDate);
    for (let d = new Date(t.startDate); d <= end; d = new Date(d.getTime() + 86_400_000)) {
      dates.push(new Date(d));
    }
    return dates;
  });

  const updated = await prisma.$transaction(async (tx) => {
    let representative: typeof request | null = null;

    for (const t of allTargets) {
      const alloc = effectiveFor(t);
      const dur = durationFor(t);
      const originalDur = Number(t.durationDays);

      const written = await tx.leaveRequest.update({
        where: { id: t.id },
        data: {
          status: 'APPROVED',
          adminNote: input.note,
          reviewedById: user.id,
          reviewedAt: now,
          durationDays: dur,
          approvedAllocation: alloc
            ? (alloc as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      if (t.id === id) representative = written;

      if (t.leaveType === 'CASUAL') {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            casualUsed: { increment: dur },
            casualPending: { decrement: originalDur },
          },
        });
      } else if (t.leaveType === 'SICK') {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            sickUsed: { increment: dur },
            sickPending: { decrement: originalDur },
          },
        });
      } else {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { replacementBalance: { decrement: dur } },
        });
      }
    }

    if (absenceDates.length > 0) {
      await tx.attendanceRecord.updateMany({
        where: {
          employeeId: request.employeeId,
          date: { in: absenceDates },
          status: 'ABSENT',
        },
        data: { status: 'LEAVE' },
      });
    }

    for (const t of allTargets) {
      const alloc = effectiveFor(t);
      const dur = durationFor(t);
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'LEAVE_APPROVED',
          targetType: 'leave_request',
          targetId: t.id,
          metadata: {
            note: input.note ?? null,
            originalDuration: Number(t.durationDays),
            finalDuration: dur,
            modified: !!alloc,
            allocation: alloc ?? null,
            bundleId: t.bundleId,
          },
        },
      });
    }

    return representative;
  });

  if (!updated) return err(500, 'MISSING_AFTER_UPDATE', 'Approve returned no row.');

  // In-app notification only — email is no longer sent for approve/reject
  // decisions per the updated design.
  const period = formatLeavePeriod(
    updated.startDate.toISOString().slice(0, 10),
    updated.endDate.toISOString().slice(0, 10),
    updated.isHalfDay,
    updated.halfDaySlot,
    updated.timeFrom,
    updated.timeTo,
  );
  const anyModified = !!(input.allocation) || !!(input.bundleAllocations && Object.keys(input.bundleAllocations).length);
  await notifyIfPermitted(applicant, 'notifications.leave_decision', {
    type: 'LEAVE_APPROVED',
    title: anyModified ? 'Your leave was approved (with adjustments)' : 'Your leave was approved',
    body: anyModified
      ? `${user.fullName} approved your ${leaveTypeLabel(updated.leaveType)} for ${period}, adjusted to ${finalDuration} day${finalDuration === 1 ? '' : 's'}.`
      : `${user.fullName} approved your ${leaveTypeLabel(updated.leaveType)} for ${period}.`,
    referenceType: 'leave_request',
    referenceId: updated.id,
  });

  return NextResponse.json({
    ok: true,
    finalDuration,
    modified: anyModified,
    cascadedSiblings: bundleSiblings.length,
  });
}
