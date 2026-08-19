/**
 * API route helpers — auth wrappers, error responses, common shapes.
 * Every route handler should go through requireAuth() so we never trust the client.
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import type { Role, User } from '@prisma/client';
import { prisma } from './db';
import { ZodError, type ZodType } from 'zod';

export type ApiUser = User;

/** Loads the current user from Postgres. Returns null if unauthenticated or unknown. */
export async function currentUser(): Promise<ApiUser | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/**
 * Requires a signed-in user. Returns [user, null] on success or [null, response] on failure.
 * When called with a `req`, also enforces per-user rate limiting on write methods
 * (POST/PATCH/PUT/DELETE): 30 writes per user per minute by default.
 */
export async function requireAuth(
  req?: Request,
  options?: { rateLimit?: { max?: number; windowMs?: number } | false }
): Promise<[ApiUser, null] | [null, NextResponse]> {
  const user = await currentUser();
  if (!user) return [null, err(401, 'UNAUTHENTICATED', 'Sign in required.')];
  if (!user.isActive) return [null, err(403, 'INACTIVE', 'Account is inactive.')];

  if (req && options?.rateLimit !== false) {
    const method = req.method.toUpperCase();
    const isWrite = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
    if (isWrite) {
      const { rateLimit } = await import('./ratelimit');
      const limited = await rateLimit(req, `user:${user.id}`, options?.rateLimit ?? {});
      if (limited) return [null, limited];
    }
  }

  return [user, null];
}

/** Requires the current user to have one of the given roles. */
export async function requireRole(
  ...allowed: Role[]
): Promise<[ApiUser, null] | [null, NextResponse]> {
  const [user, error] = await requireAuth();
  if (error) return [null, error];
  if (!allowed.includes(user.role))
    return [null, err(403, 'FORBIDDEN', 'You do not have permission for this action.')];
  return [user, null];
}

export function canApprove(role: Role): boolean {
  return role === 'ADMIN' || role === 'HR' || role === 'SUPER_ADMIN';
}

/** Validate a JSON request body against a Zod schema. */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<[T, null] | [null, NextResponse]> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return [null, err(400, 'BAD_JSON', 'Request body must be valid JSON.')];
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return [
      null,
      NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body.',
          issues: parsed.error.issues,
        },
        { status: 400 }
      ),
    ];
  }
  return [parsed.data, null];
}

/** Standard error response. */
export function err(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: code, message }, { status });
}

/** Convert a Zod error into our response shape. */
export function zodErr(e: ZodError): NextResponse {
  return NextResponse.json(
    { error: 'VALIDATION_FAILED', message: 'Invalid request.', issues: e.issues },
    { status: 400 }
  );
}

/** Wrap a route handler with a try/catch and log unexpected errors. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error('[API]', e);
      const message = e instanceof Error ? e.message : 'Unknown error';
      return err(500, 'INTERNAL', message);
    }
  };
}
