import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { resolveAuditRows } from '@/lib/auditEnrich';
import { createWorkbook, addSheet, addRows, xlsxResponse, type Col } from '@/lib/reports/workbook';

/**
 * GET /api/audit-log/export
 * Same filters as /api/audit-log, but returns an .xlsx download of every
 * matching row (capped at 5000 to keep the file sane).
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
  const cap = 5000;

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (fromStr) createdAt.gte = new Date(fromStr);
  if (toStr) createdAt.lte = new Date(toStr);

  const rows = await prisma.auditLog.findMany({
    where: {
      action,
      actorId,
      createdAt: Object.keys(createdAt).length > 0 ? createdAt : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: cap,
    include: {
      actor: { select: { id: true, fullName: true, email: true, role: true } },
    },
  });

  const enriched = await resolveAuditRows(rows);
  const filtered = targetUserId
    ? enriched.filter((r) => r.targetUser?.id === targetUserId)
    : enriched;

  const columns: Col[] = [
    { header: 'Date',          key: 'date',        width: 14, format: 'date' },
    { header: 'Time',          key: 'time',        width: 12 },
    { header: 'Actor',         key: 'actor',       width: 26 },
    { header: 'Actor role',    key: 'actorRole',   width: 14 },
    { header: 'Action',        key: 'action',      width: 26 },
    { header: 'Detail',        key: 'detail',      width: 50 },
    { header: 'Target user',   key: 'targetUser',  width: 26 },
    { header: 'Target type',   key: 'targetType',  width: 20 },
    { header: 'Target ID',     key: 'targetId',    width: 26 },
    { header: 'IP',            key: 'ip',          width: 16 },
  ];

  const wb = createWorkbook();
  const sheet = addSheet(wb, 'Audit Log', columns);

  addRows(sheet, filtered.map((r) => {
    const d = new Date(r.createdAt);
    return {
      date: d,
      time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      actor: r.actor?.fullName ?? 'System',
      actorRole: r.actor?.role ?? '',
      action: r.action,
      detail: r.detail,
      targetUser: r.targetUser?.fullName ?? '',
      targetType: r.targetType ?? '',
      targetId: r.targetId ?? '',
      ip: r.ip ?? '',
    };
  }));

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return xlsxResponse(wb, `audit-log-${stamp}.xlsx`);
}
