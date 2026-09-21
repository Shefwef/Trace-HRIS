import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { checkPermission } from '@/lib/permissions';
import { rebuildAttendanceRange } from '@/lib/biometric';
import { dayKeyToDateOnly } from '@/lib/workday';

/**
 * POST /api/biometric/rebuild
 * Body: { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }
 *
 * Recomputes attendance records from stored biometric punches for the given
 * date range (inclusive of `from`, exclusive of `to`). Defaults: last 7 days
 * through today+1. Requires biometric.manage.
 */
export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'biometric.manage');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.manage required.');

  let body: { from?: string; to?: string } = {};
  try { body = (await req.json()) as { from?: string; to?: string }; } catch { /* empty body OK */ }

  const today = new Date();
  const defaultTo = new Date(Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1,
  ));
  const defaultFrom = new Date(defaultTo.getTime() - 7 * 86_400_000);

  const from = body.from && /^\d{4}-\d{2}-\d{2}$/.test(body.from)
    ? dayKeyToDateOnly(body.from) : defaultFrom;
  const to = body.to && /^\d{4}-\d{2}-\d{2}$/.test(body.to)
    ? dayKeyToDateOnly(body.to) : defaultTo;

  if (to <= from) return err(400, 'BAD_RANGE', '`to` must be after `from`.');

  const summary = await rebuildAttendanceRange(from, to);
  return NextResponse.json(summary);
}
