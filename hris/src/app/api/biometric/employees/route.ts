import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth, err, parseBody } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';

export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  const hasPerm = await checkPermission(user, 'biometric.manage');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.manage required.');

  const employees = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      fullName: true,
      department: true,
      designation: true,
      employeeIdCode: true,
      biometricUserId: true,
    },
    orderBy: { fullName: 'asc' },
  });

  return NextResponse.json(employees);
}

const PatchSchema = z.object({ biometricUserId: z.string().nullable() });

export async function PATCH(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  const hasPerm = await checkPermission(user, 'biometric.manage');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.manage required.');

  const url = new URL(req.url);
  const employeeId = url.searchParams.get('employeeId');
  if (!employeeId) return err(400, 'MISSING_ID', 'employeeId query param required.');

  const [input, bad] = await parseBody(req, PatchSchema);
  if (bad) return bad;

  // Ensure uniqueness: clear any existing mapping for this biometricUserId first
  if (input.biometricUserId) {
    await prisma.user.updateMany({
      where: { biometricUserId: input.biometricUserId, id: { not: employeeId } },
      data: { biometricUserId: null },
    });
  }

  await prisma.user.update({
    where: { id: employeeId },
    data: { biometricUserId: input.biometricUserId },
  });

  // Apply any existing unmapped punches for this deviceUserId
  if (input.biometricUserId) {
    await prisma.biometricPunch.updateMany({
      where: { deviceUserId: input.biometricUserId, employeeId: null },
      data: { employeeId, appliedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
