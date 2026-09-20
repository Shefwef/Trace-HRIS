import { NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { prisma } from '@/lib/db';
import { requireAuth, parseBody, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { InviteEmployeeSchema } from '@/lib/validation';
import { primaryRole, validateRoleAssignment } from '@/lib/roles';

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

  // Check for existing user by email (in Clerk or in our DB)
  const existingDb = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingDb)
    return err(409, 'ALREADY_EXISTS', 'A user with this email already exists.');

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

  const year = new Date().getFullYear();
  const cycleStartDate = new Date(year, input.cycleStartMonth - 1, 1);
  const cycleEndDate = new Date(year, input.cycleStartMonth - 1 + 12, 0);

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
      cycleStartMonth: input.cycleStartMonth,
      lineManagerId: input.lineManagerId,
      phone: input.phone || undefined,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      joiningDate: input.joiningDate ? new Date(input.joiningDate) : undefined,
      avatarUrl: input.avatarUrl || undefined,
    },
  });

  await prisma.leaveBalance.create({
    data: {
      employeeId: clerkUser.id,
      cycleYear: year,
      cycleStartDate,
      cycleEndDate,
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
  const words = ['Trace', 'HRIS', 'Welcome', 'Access', 'Secure', 'Login'];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const suffix = '!';
  return `${w1}-${num}${suffix}`;
}
