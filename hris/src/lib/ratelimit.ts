import { NextResponse } from 'next/server';
import { prisma } from './db';

/**
 * Simple fixed-window rate limiter backed by Postgres.
 *
 * - windowMs: length of each bucket (e.g. 60_000 = 1 minute)
 * - max: allowed requests per subject per key per window
 *
 * If the subject exceeds `max` requests in the current window, we return a
 * 429 NextResponse. Otherwise `null`.
 *
 * Design notes:
 *   - Uses a UNIQUE (subject, key, windowStart) constraint + upsert with
 *     increment, so concurrent requests are safe (Postgres handles the merge).
 *   - Windows expire naturally; a periodic prune keeps the table small
 *     (see prune() below — call from a cron or once on cold start).
 */
export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export async function rateLimit(
  req: Request,
  subject: string,
  options: RateLimitOptions = {}
): Promise<NextResponse | null> {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 30;

  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const key = `${req.method} ${new URL(req.url).pathname}`;

  // Atomic upsert + increment. If the row didn't exist we create with count=1;
  // if it did, we increment.
  const bucket = await prisma.rateLimitBucket.upsert({
    where: { subject_key_windowStart: { subject, key, windowStart } },
    create: { subject, key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (bucket.count > max) {
    const resetAt = new Date(windowStart.getTime() + windowMs);
    const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000));
    return NextResponse.json(
      {
        error: 'RATE_LIMITED',
        message: `Too many requests. Try again in ${retryAfter}s.`,
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': max.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toISOString(),
        },
      }
    );
  }

  return null;
}

/**
 * Delete rate-limit rows older than `keepMs` (default 1 hour). Safe to run
 * repeatedly. Call from an admin trigger or a periodic job.
 */
export async function pruneRateLimitBuckets(keepMs = 60 * 60_000) {
  const cutoff = new Date(Date.now() - keepMs);
  const result = await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return result.count;
}
