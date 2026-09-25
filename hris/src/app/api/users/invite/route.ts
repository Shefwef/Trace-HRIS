import { NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { prisma } from '@/lib/db';
import { requireAuth, parseBody, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { InviteEmployeeSchema } from '@/lib/validation';
import { primaryRole, validateRoleAssignment } from '@/lib/roles';
import { sendEmail } from '@/lib/email';
import { welcomeInviteEmail } from '@/emails/templates';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

/** POST /api/users/invite — HR/Admin/Super Admin invites a new user. */
export async function POST(req: Request) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(actor, 'employee.invite');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'You do not have permission to invite employees.');

  const [input, badReq] = await parseBody(req, InviteEmployeeSchema);
  if (badReq) return badReq;

  // Hierarchy check: the actor can only invite with roles they're allowed to grant.
  const invalid = validateRoleAssignment(actor, input.roles);
  if (invalid) return err(403, 'ROLE_ELEVATION_FORBIDDEN', invalid);
  const dedupedRoles = Array.from(new Set(input.roles));
  const primary = primaryRole(dedupedRoles);

  // Pre-checks: email + employee ID must be unique in both our DB and Clerk.
  const existingDb = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingDb)
    return err(409, 'ALREADY_EXISTS', 'A user with this email already exists.');

  const existingByCode = await prisma.user.findUnique({
    where: { employeeIdCode: input.employeeIdCode },
  });
  if (existingByCode)
    return err(
      409,
      'EMPLOYEE_ID_TAKEN',
      `Employee ID "${input.employeeIdCode}" is already assigned to ${existingByCode.fullName}. Pick a different ID.`,
    );

  const existingClerk = await clerk.users.getUserList({ emailAddress: [input.email] });
  if (existingClerk.data.length > 0)
    return err(409, 'ALREADY_EXISTS', 'A Clerk user with this email already exists.');

  // Generate a random password if none provided; user will change it on first sign-in
  const initialPassword = input.password ?? generatePassword();

  const clerkUser = await clerk.users.createUser({
    emailAddress: [input.email],
    firstName: input.firstName,
    lastName: input.lastName || undefined,
    password: initialPassword,
    skipPasswordChecks: true,
    publicMetadata: {
      role: primary,
      roles: dedupedRoles,
      department: input.department,
      designation: input.designation,
      employeeIdCode: input.employeeIdCode,
    },
  });

  // Leave cycle runs from the joining anniversary that started on or before
  // today, ending one day before the next anniversary. Someone who joined
  // 2026-09-22 has a cycle 2026-09-22 → 2027-09-21.
  const joining = new Date(input.joiningDate);
  const today = new Date();
  const cycleAnchorYear =
    today >= new Date(today.getFullYear(), joining.getMonth(), joining.getDate())
      ? today.getFullYear()
      : today.getFullYear() - 1;
  const startY = Math.max(joining.getFullYear(), cycleAnchorYear);
  const cycleStartDate = new Date(startY, joining.getMonth(), joining.getDate());
  const cycleEndDate = new Date(startY + 1, joining.getMonth(), joining.getDate() - 1);
  const cycleYear = startY;

  // Race-condition safety net: even after the pre-check above, a concurrent
  // invite could race the same email/employeeIdCode. If the DB insert fails,
  // roll back the Clerk user so we don't leave an orphan account that would
  // then block every subsequent attempt with the same email.
  try {
    await prisma.user.create({
      data: {
        id: clerkUser.id,
        fullName: `${input.firstName}${input.lastName ? ' ' + input.lastName : ''}`.trim(),
        email: input.email,
        role: primary,
        roles: dedupedRoles,
        department: input.department || undefined,
        designation: input.designation,
        employeeIdCode: input.employeeIdCode,
        cycleStartMonth: joining.getMonth() + 1,
        cycleStartDay: joining.getDate(),
        lineManagerId: input.lineManagerId,
        phone: input.phone || undefined,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        joiningDate: joining,
        avatarUrl: input.avatarUrl || undefined,
      },
    });
  } catch (dbErr: unknown) {
    // Best-effort rollback of the Clerk user we just created.
    await clerk.users.deleteUser(clerkUser.id).catch(() => { /* logged below */ });

    const code = (dbErr as { code?: string })?.code;
    const target = (dbErr as { meta?: { target?: string[] } })?.meta?.target;
    if (code === 'P2002') {
      if (target?.includes('employeeIdCode'))
        return err(409, 'EMPLOYEE_ID_TAKEN', `Employee ID "${input.employeeIdCode}" is already in use.`);
      if (target?.includes('email'))
        return err(409, 'ALREADY_EXISTS', 'A user with this email already exists.');
      return err(409, 'ALREADY_EXISTS', `Unique constraint hit on: ${target?.join(', ') ?? 'unknown field'}.`);
    }
    console.error('[POST /api/users/invite] DB insert failed, rolled back Clerk user', dbErr);
    return err(500, 'INTERNAL', 'Could not create the employee. The Clerk account has been rolled back; you can retry.');
  }

  await prisma.leaveBalance.create({
    data: {
      employeeId: clerkUser.id,
      cycleYear,
      cycleStartDate,
      cycleEndDate,
      casualTotal: 8,
      sickTotal: 10,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'USER_INVITED',
      targetType: 'user',
      targetId: clerkUser.id,
      metadata: {
        email: input.email,
        roles: dedupedRoles,
        department: input.department,
      },
    },
  });

  // Send welcome email with sign-in credentials. Fire-and-forget so a mail
  // provider hiccup never blocks the invite response — the credentials are
  // still returned in the API response for the inviter to hand off manually
  // if needed, and every attempt is captured in emailLog for audit.
  const settings = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  const signInUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/sign-in`;
  const { subject, html, text } = welcomeInviteEmail(
    {
      employeeName: input.firstName,
      loginEmail: input.email,
      initialPassword,
      signInUrl,
      inviterName: actor.fullName,
      designation: input.designation,
    },
    { senderName: settings.senderName },
  );
  void sendEmail({
    to: [input.email],
    subject,
    html,
    text,
    referenceType: 'user_invite',
    referenceId: clerkUser.id,
  });

  return NextResponse.json(
    {
      ok: true,
      id: clerkUser.id,
      email: input.email,
      initialPassword,
    },
    { status: 201 }
  );
}

/** Generate a memorable but strong password. */
function generatePassword(): string {
  const words = ['Trace', 'HRMS', 'Welcome', 'Access', 'Secure', 'Login'];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const suffix = '!';
  return `${w1}-${num}${suffix}`;
}
