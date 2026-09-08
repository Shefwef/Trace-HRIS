/**
 * POST /api/leaves/grant-replacement
 *
 * HR / Line Manager directly grants an APPROVED replacement leave to an
 * employee, without the employee having to submit a request first.
 *
 * The grant is stored as a normal LeaveRequest (type=REPLACEMENT,
 * status=APPROVED) with `grantedById` set to the actor. The employee's
 * replacementBalance is NOT touched (the leave itself IS the credit,
 * so debiting the balance would zero it out immediately).
 *
 * Any ABSENT attendance rows on the granted dates are converted to LEAVE,
 * mirroring the existing approval flow.
 *
 * Access:
 *   - Requires `replacement.grant` permission (HR / Admin / Super Admin / Line Manager)
 *   - HR / Admin / Super Admin: may grant to any employee-tagged user
 *   - Line Manager: may grant only to their direct reports
 *
 * Notifies (in-app):
 *   - Employee receiving the leave
 *   - Employee's line manager (if the granter is HR/Admin and a LM exists)
 *   - Any HR user (if the granter is a Line Manager)
 *   - The granter themselves (audit copy)
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody, canApproveRequest } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { GrantReplacementLeaveSchema } from '@/lib/validation';
import { notify, notifyMany } from '@/lib/notifications';
import { formatLeavePeriod } from '@/lib/leave';

function daysBetween(start: string, end: string, isHalfDay: boolean): number {
  if (isHalfDay) return 0.5;
  const s = new Date(start + 'T00:00:00Z').getTime();
  const e = new Date(end + 'T00:00:00Z').getTime();
  return Math.round((e - s) / 86_400_000) + 1;
}

export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'replacement.grant');
  if (!hasPerm)
    return err(403, 'FORBIDDEN', 'You do not have permission to grant replacement leave.');

  const [input, badReq] = await parseBody(req, GrantReplacementLeaveSchema);
  if (badReq) return badReq;

  const employee = await prisma.user.findUnique({ where: { id: input.employeeId } });
  if (!employee) return err(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
  if (!employee.isActive) return err(400, 'EMPLOYEE_INACTIVE', 'Employee is deactivated.');

  // Self-grant guard — same principle as self-approval
  if (employee.id === user.id)
    return err(403, 'SELF_GRANT', 'You cannot grant replacement leave to yourself.');

  // Hierarchy: HR/Admin/Super Admin may grant to anyone (except peers per canApproveRequest).
  // Line Manager may only grant to their direct reports.
  const hierarchyError = canApproveRequest(user, employee);
  if (hierarchyError) return err(403, 'HIERARCHY_VIOLATION', hierarchyError);

  const duration = daysBetween(input.startDate, input.endDate, input.isHalfDay);
  if (duration <= 0)
    return err(400, 'ZERO_DURATION', 'Granted duration must be greater than zero.');

  const now = new Date();
  const startDate = new Date(input.startDate + 'T00:00:00Z');
  const endDate = new Date(input.endDate + 'T00:00:00Z');
  const overtimeDate = input.overtimeWorkDate
    ? new Date(input.overtimeWorkDate + 'T00:00:00Z')
    : null;

  // Compute date range for ABSENT → LEAVE backfill
  const absenceDates: Date[] = [];
  for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + 86_400_000)) {
    absenceDates.push(new Date(d));
  }

  const created = await prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.create({
      data: {
        employeeId: employee.id,
        leaveType: 'REPLACEMENT',
        startDate,
        endDate,
        isHalfDay: input.isHalfDay,
        halfDaySlot: input.isHalfDay ? input.halfDaySlot ?? null : null,
        durationDays: duration,
        reason: input.reason,
        description: input.description,
        channels: ['IN_APP'],
        status: 'APPROVED',
        adminNote: input.description ?? null,
        reviewedById: user.id,
        reviewedAt: now,
        grantedById: user.id,
        overtimeWorkDate: overtimeDate,
      },
    });

    // Convert ABSENT attendance to LEAVE on granted days
    if (absenceDates.length > 0) {
      await tx.attendanceRecord.updateMany({
        where: {
          employeeId: employee.id,
          date: { in: absenceDates },
          status: 'ABSENT',
        },
        data: { status: 'LEAVE' },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'REPLACEMENT_LEAVE_GRANTED',
        targetType: 'leave_request',
        targetId: leave.id,
        metadata: {
          employeeId: employee.id,
          durationDays: duration,
          startDate: input.startDate,
          endDate: input.endDate,
          isHalfDay: input.isHalfDay,
          halfDaySlot: input.halfDaySlot ?? null,
          overtimeWorkDate: input.overtimeWorkDate ?? null,
          reason: input.reason,
        },
      },
    });

    return leave;
  });

  const period = formatLeavePeriod(
    input.startDate,
    input.endDate,
    input.isHalfDay,
    input.halfDaySlot ?? null,
    null,
    null,
  );
  const durationLabel = `${duration} day${duration === 1 ? '' : 's'}`;

  // ─── Notifications ──────────────────────────────────────
  // 1. Employee (always)
  await notify({
    recipientId: employee.id,
    type: 'LEAVE_APPROVED',
    title: 'Replacement leave granted',
    body: `${user.fullName} granted you ${durationLabel} of replacement leave on ${period}.`,
    referenceType: 'leave_request',
    referenceId: created.id,
  });

  // 2. Granter (audit copy) + related managers/HR
  const granterRoles = user.roles?.length ? user.roles : [user.role];
  const granterIsHRAdmin =
    granterRoles.includes('HR') ||
    granterRoles.includes('ADMIN') ||
    granterRoles.includes('SUPER_ADMIN');
  const granterIsLineManagerOnly =
    !granterIsHRAdmin && granterRoles.includes('LINE_MANAGER');

  const extraRecipients: string[] = [user.id]; // granter always gets an audit copy

  if (granterIsHRAdmin && employee.lineManagerId && employee.lineManagerId !== user.id) {
    extraRecipients.push(employee.lineManagerId);
  }

  if (granterIsLineManagerOnly) {
    // Notify HR / Admin so they can see LM-issued grants
    const hrUsers = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: { in: ['HR', 'ADMIN', 'SUPER_ADMIN'] } },
          { roles: { hasSome: ['HR', 'ADMIN', 'SUPER_ADMIN'] } },
        ],
      },
      select: { id: true },
    });
    for (const h of hrUsers) {
      if (h.id !== user.id) extraRecipients.push(h.id);
    }
  }

  const unique = Array.from(new Set(extraRecipients)).filter((id) => id !== employee.id);
  if (unique.length > 0) {
    await notifyMany(
      unique.map((id) => ({
        recipientId: id,
        type: 'LEAVE_APPROVED' as const,
        title: `Replacement leave granted to ${employee.fullName}`,
        body: `${user.fullName} granted ${durationLabel} on ${period}.`,
        // Audit copies for managers/HR — click through to the admin queue,
        // not the individual employee's leave list.
        referenceType: 'admin_requests',
        referenceId: created.id,
      })),
    );
  }

  return NextResponse.json({
    ok: true,
    leaveRequestId: created.id,
    durationDays: duration,
  }, { status: 201 });
}
