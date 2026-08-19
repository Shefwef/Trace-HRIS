import { prisma } from './db';

/**
 * Write an audit-log entry with request context (IP + user-agent) when we have
 * access to a Request object. Prefer this over `prisma.auditLog.create` in
 * route handlers so we have a fingerprint of every state change.
 */
export async function writeAudit(input: {
  req?: Request;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: unknown;
}) {
  const ip = input.req ? clientIp(input.req) : null;
  const ua = input.req ? input.req.headers.get('user-agent') : null;

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? undefined,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: (input.metadata ?? null) as import('@prisma/client').Prisma.InputJsonValue,
      ip: ip ?? undefined,
      userAgent: ua ?? undefined,
    },
  });
}

function clientIp(req: Request): string | null {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]?.trim() ?? null;
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return null;
}
