import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api';

/**
 * User directory used by @mentions, avatar rendering, admin lists.
 *
 * Filters:
 *   ?includeDeactivated=true   — include isActive=false users (Deactivated tab)
 *   ?deleted=true              — return ONLY soft-deleted users (Deleted tab)
 * By default the response excludes deactivated + deleted users.
 */
export async function GET(req: Request) {
  const [, error] = await requireAuth(req);
  if (error) return error;

  const url = new URL(req.url);
  const includeDeactivated = url.searchParams.get('includeDeactivated') === 'true';
  const deletedOnly = url.searchParams.get('deleted') === 'true';

  const where = deletedOnly
    ? { deletedAt: { not: null } }
    : includeDeactivated
      ? { deletedAt: null }
      : { isActive: true, deletedAt: null };

  const users = await prisma.user.findMany({
    where,
    orderBy: { fullName: 'asc' },
    select: {
      id: true, fullName: true, email: true, role: true, roles: true,
      department: true, designation: true, employeeIdCode: true, avatarUrl: true,
      phone: true, dateOfBirth: true, joiningDate: true,
      isActive: true, lineManagerId: true,
      deletedAt: true,
      lineManager: { select: { id: true, fullName: true } },
    },
  });
  return NextResponse.json(users);
}
