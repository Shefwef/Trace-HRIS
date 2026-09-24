import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/cron/clean-deleted-users
 *
 * Runs daily. Permanently deletes any user whose `deletedAt` is older than
 * 60 days — the "trash" retention window. Guarded by a bearer secret so it
 * can only be triggered by Vercel Cron / an external scheduler.
 *
 * Response summarises rows removed so cron dashboards can surface anomalies.
 */
export const runtime = 'nodejs';

const RETENTION_DAYS = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const stale = await prisma.user.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, fullName: true, email: true, deletedAt: true },
  });

  let removed = 0;
  const errors: { id: string; message: string }[] = [];
  for (const u of stale) {
    try {
      await prisma.user.delete({ where: { id: u.id } });
      await prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'USER_AUTO_PURGED',
          targetType: 'user',
          targetId: u.id,
          metadata: { fullName: u.fullName, email: u.email, deletedAt: u.deletedAt?.toISOString() ?? null },
        },
      });
      removed++;
    } catch (e) {
      errors.push({ id: u.id, message: (e as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    retentionDays: RETENTION_DAYS,
    scanned: stale.length,
    removed,
    errors,
  });
}
