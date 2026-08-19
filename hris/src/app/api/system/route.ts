import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, err } from '@/lib/api';

/** GET /api/system — Super Admin only. Returns a health snapshot. */
export async function GET(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;
  if (user.role !== 'SUPER_ADMIN')
    return err(403, 'FORBIDDEN', 'Only Super Admin can view system status.');

  // Try DB round-trip
  const dbStart = Date.now();
  let dbOk = true;
  let dbError: string | null = null;
  let counts: Record<string, number> | null = null;
  try {
    const [users, leaves, extraWork, holidays, notifs, emails, audit] = await Promise.all([
      prisma.user.count(),
      prisma.leaveRequest.count(),
      prisma.extraWorkLog.count(),
      prisma.holiday.count(),
      prisma.notification.count(),
      prisma.emailLog.count(),
      prisma.auditLog.count(),
    ]);
    counts = { users, leaveRequests: leaves, extraWorkLogs: extraWork, holidays, notifications: notifs, emailLog: emails, auditLog: audit };
  } catch (e) {
    dbOk = false;
    dbError = e instanceof Error ? e.message : 'Unknown';
  }
  const dbLatencyMs = Date.now() - dbStart;

  const env = {
    node: process.version,
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    clerkConfigured: !!process.env.CLERK_SECRET_KEY,
    databaseUrlHost: safeDbHost(process.env.DATABASE_URL),
    resendConfigured: !!process.env.RESEND_API_KEY,
    nodeEnv: process.env.NODE_ENV,
  };

  return NextResponse.json({
    ok: dbOk,
    checkedAt: new Date().toISOString(),
    db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError, counts },
    env,
  });
}

function safeDbHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return 'unparseable';
  }
}
