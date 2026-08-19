import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

/**
 * GET /api/audit-log
 *   ?action=LEAVE_APPROVED      — filter by exact action
 *   ?actorId=user_xxx           — filter by actor
 *   ?targetType=leave_request   — filter by target type
 *   ?since=YYYY-MM-DD           — from date
 *   ?limit=100                  — max rows (default 100, max 500)
 *
 *   Super Admin only.
 */
export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  if (user.role !== 'SUPER_ADMIN')
    return err(403, 'FORBIDDEN', 'Only Super Admin can view the audit log.');

  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? undefined;
  const actorId = url.searchParams.get('actorId') ?? undefined;
  const targetType = url.searchParams.get('targetType') ?? undefined;
  const since = url.searchParams.get('since');
  const limitStr = url.searchParams.get('limit');
  const limit = limitStr ? Math.min(500, Math.max(1, parseInt(limitStr, 10) || 100)) : 100;

  const rows = await prisma.auditLog.findMany({
    where: {
      action,
      actorId,
      targetType,
      createdAt: since ? { gte: new Date(since + 'T00:00:00Z') } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: { select: { id: true, fullName: true, email: true, role: true } },
    },
  });

  // Distinct actions for the filter dropdown
  const distinctActionsRaw = await prisma.auditLog.findMany({
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
    take: 100,
  });
  const distinctActions = distinctActionsRaw.map((r) => r.action);

  return NextResponse.json({
    total: rows.length,
    limit,
    actions: distinctActions,
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
      actor: r.actor,
    })),
  });
}
