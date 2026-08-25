import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [actor, error] = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;

  // Authorization: Only the line manager themselves, or Admin/Super Admin/HR
  if (
    actor.id !== id &&
    !actor.roles.includes('SUPER_ADMIN') &&
    !actor.roles.includes('ADMIN') &&
    !actor.roles.includes('HR')
  ) {
    return err(403, 'FORBIDDEN', 'You do not have permission to view this team roster.');
  }

  const reports = await prisma.user.findMany({
    where: { lineManagerId: id, isActive: true },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      roles: true,
      department: true,
      designation: true,
      avatarUrl: true,
    },
    orderBy: { fullName: 'asc' },
  });

  return NextResponse.json(reports);
}
