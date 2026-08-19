import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api';

/** Simple user directory: everyone can see basic info of every other user for @mentions,
 *  avatar rendering in inboxes etc. Roles/deptartments included; no secrets. */
export async function GET() {
  const [, error] = await requireAuth();
  if (error) return error;

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { fullName: 'asc' },
    select: {
      id: true, fullName: true, email: true, role: true,
      department: true, designation: true, employeeIdCode: true, avatarUrl: true,
    },
  });
  return NextResponse.json(users);
}
