import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { resolveAuditRows, type ActorLike, type EnrichedRow } from '@/lib/auditEnrich';

/**
 * GET /api/audit-log
 *   ?action=LEAVE_APPROVED          — exact action match
 *   ?actorId=user_xxx               — who performed the action
 *   ?targetUserId=user_yyy          — who was affected (derived from targetType/Id)
 *   ?from=YYYY-MM-DDTHH:mm          — inclusive lower bound (ISO)
 *   ?to=YYYY-MM-DDTHH:mm            — inclusive upper bound (ISO)
 *   ?limit=200                      — max rows returned (default 200, max 1000)
 *
 * Gated on the runtime `audit.view` permission — HR, Admin, Line Manager and
 * Super Admin see it by default.
 */
export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'audit.view');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'You do not have audit.view permission.');

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || undefined;
  const actorId = url.searchParams.get('actorId') || undefined;
  const targetUserId = url.searchParams.get('targetUserId') || undefined;
  const fromStr = url.searchParams.get('from');
  const toStr = url.searchParams.get('to');
  const limitStr = url.searchParams.get('limit');
  const limit = limitStr ? Math.min(1000, Math.max(1, parseInt(limitStr, 10) || 200)) : 200;

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (fromStr) createdAt.gte = new Date(fromStr);
  if (toStr) createdAt.lte = new Date(toStr);

  // If filtering by target user, we over-fetch and post-filter (target user is
  // derived, not stored directly on the audit row).
  const overFetch = targetUserId ? Math.min(1000, limit * 4) : limit;

  const rows = await prisma.auditLog.findMany({
    where: {
      action,
      actorId,
      createdAt: Object.keys(createdAt).length > 0 ? createdAt : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: overFetch,
    include: {
      actor: { select: { id: true, fullName: true, email: true, role: true } },
    },
  });

  const enriched = await resolveAuditRows(rows);
  const filtered = targetUserId
    ? enriched.filter((r) => r.targetUser?.id === targetUserId)
    : enriched;
  const finalRows = filtered.slice(0, limit);

  // Filter options — distinct actions ever recorded + all users seen as actor
  // or target so the UI dropdowns are populated correctly.
  const [distinctActionsRaw, distinctUsersRaw] = await Promise.all([
    prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
      take: 200,
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  return NextResponse.json({
    total: finalRows.length,
    limit,
    actions: distinctActionsRaw.map((r) => r.action),
    users: distinctUsersRaw as ActorLike[],
    items: finalRows satisfies EnrichedRow[],
  });
}
