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
 * date range. Both `from` and `to` are treated as **inclusive** day keys, so
 * `from = to = '2026-09-21'` correctly rebuilds just that single day.
 * Defaults: last 7 days through today. Requires biometric.manage.
 */
export async function POST(req: Request) {
  const [user, error] = await requireAuth(req);
  if (error) return error;

  const hasPerm = await checkPermission(user, 'biometric.manage');
  if (!hasPerm) return err(403, 'FORBIDDEN', 'biometric.manage required.');

  let body: { from?: string; to?: string } = {};
  try { body = (await req.json()) as { from?: string; to?: string }; } catch { /* empty body OK */ }

  const today = new Date();

  const fromDay = body.from && /^\d{4}-\d{2}-\d{2}$/.test(body.from)
    ? dayKeyToDateOnly(body.from)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6));

  // `to` is inclusive; convert to the exclusive upper bound used by the range
  // query by adding one day. `from = to` therefore covers exactly one day.
  const toInclusive = body.to && /^\d{4}-\d{2}-\d{2}$/.test(body.to)
    ? dayKeyToDateOnly(body.to)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const toExclusive = new Date(toInclusive.getTime() + 86_400_000);

  if (toExclusive <= fromDay) return err(400, 'BAD_RANGE', '`to` must be on or after `from`.');

  try {
    const summary = await rebuildAttendanceRange(fromDay, toExclusive);
    return NextResponse.json(summary);
  } catch (e) {
    console.error('[rebuild] error:', e);
    return err(500, 'REBUILD_ERROR', e instanceof Error ? e.message : String(e));
  }
}
