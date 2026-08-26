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

/**
 * Whether the given actor has review power over leave, holidays,
 * settings and employee mutations. Accepts either a bare Role (legacy
 * callsites) or a full user-like object under the multi-role model.
 * When passed an object it checks the user's `roles` array first,
 * falling back to the denormalized `role` field.
 */
export function canApprove(
  userOrRole: Role | { role: Role; roles?: Role[] | null },
): boolean {
  const roles: readonly Role[] =
    typeof userOrRole === 'string'
      ? [userOrRole]
      : userOrRole.roles && userOrRole.roles.length > 0
        ? userOrRole.roles
        : [userOrRole.role];
  return (
    roles.includes('ADMIN') ||
    roles.includes('HR') ||
    roles.includes('SUPER_ADMIN') ||
    roles.includes('LINE_MANAGER')
  );
}

/**
 * Hierarchical authorization for approve/reject actions.
 * Returns null if allowed, or a human-readable message if forbidden.
 *
 * Rules:
 *   SUPER_ADMIN / ADMIN -> can approve/reject any request
 *   HR                  -> can approve/reject except ADMIN or SUPER_ADMIN applicant
 *   LINE_MANAGER        -> only where applicant.lineManagerId === actor.id
 *   EMPLOYEE            -> cannot approve
 *
 * Self-approval/rejection is always forbidden (handled separately).
 */
export function canApproveRequest(
  actor: { id: string; role: Role; roles?: Role[] | null },
  applicant: { id: string; role: Role; roles?: Role[] | null; lineManagerId?: string | null },
): string | null {
  const actorRoles: readonly Role[] =
    actor.roles && actor.roles.length > 0 ? actor.roles : [actor.role];
  const applicantRoles: readonly Role[] =
    applicant.roles && applicant.roles.length > 0 ? applicant.roles : [applicant.role];

  // SUPER_ADMIN or ADMIN can approve anyone
  if (actorRoles.includes('SUPER_ADMIN') || actorRoles.includes('ADMIN')) {
    return null;
  }

  // HR can approve anyone except ADMIN or SUPER_ADMIN applicants
  if (actorRoles.includes('HR')) {
    if (applicantRoles.includes('ADMIN') || applicantRoles.includes('SUPER_ADMIN')) {
      return 'HR cannot approve or reject requests from Admin or Super Admin users.';
    }
    return null;
  }

  // LINE_MANAGER can only approve their direct reports
  if (actorRoles.includes('LINE_MANAGER')) {
    if (applicant.lineManagerId === actor.id) {
      return null;
    }
    return 'Line Managers can only approve or reject requests from their assigned team members.';
  }

  // EMPLOYEE cannot approve
  return 'You do not have permission to approve or reject requests.';
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

/**
 * True for a Prisma unique-constraint violation (P2002). Used where a race is
 * expected and a 409 is a better answer than a 500 — e.g. the partial unique
 * index that keeps one work-location period open per employee.
 */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: unknown }).code === 'P2002'
  );
}
