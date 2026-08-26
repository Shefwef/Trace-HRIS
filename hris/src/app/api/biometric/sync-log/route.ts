import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';

export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  const hasPerm = await checkPermission(user, 'biometric.view');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.view required.');

  const logs = await prisma.biometricSyncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(
    logs.map((l) => ({
      id: l.id,
      deviceId: l.deviceId,
      startedAt: l.startedAt.toISOString(),
      received: l.received,
      applied: l.applied,
      duplicates: l.duplicates,
      unmapped: l.unmapped,
      error: l.error,
    })),
  );
}
