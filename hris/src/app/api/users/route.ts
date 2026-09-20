import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api';

/** Simple user directory: everyone can see basic info of every other user for @mentions,
 *  avatar rendering in inboxes etc. Roles/deptartments included; no secrets. */
export async function GET(req: Request) {
  const [, error] = await requireAuth(req);
  if (error) return error;

  const url = new URL(req.url);
  const includeDeactivated = url.searchParams.get('includeDeactivated') === 'true';

  const users = await prisma.user.findMany({
    where: includeDeactivated ? {} : { isActive: true },
    orderBy: { fullName: 'asc' },
    select: {
      id: true, fullName: true, email: true, role: true, roles: true,
      department: true, designation: true, employeeIdCode: true, avatarUrl: true,
      phone: true, dateOfBirth: true, joiningDate: true,
      isActive: true, lineManagerId: true,
      lineManager: { select: { id: true, fullName: true } },
    },
  });
  return NextResponse.json(users);
}
