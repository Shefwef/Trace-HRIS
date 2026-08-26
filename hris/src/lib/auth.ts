import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { prisma } from './db';

/** Get the currently signed-in user, or null. Loads role from Postgres. */
export async function getCurrentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user;
}

/** Require any signed-in user. Redirects to /sign-in if not. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return user;
}

/** Require one of the specified roles. Redirects to /sign-in or /. */
export async function requireRole(...allowed: Role[]) {
  const user = await requireUser();
  if (!allowed.includes(user.role)) redirect('/');
  return user;
}

/** Convenience helper: is this user allowed to approve leaves/extra-work? */
export function canApprove(role: Role) {
  return role === 'ADMIN' || role === 'HR' || role === 'SUPER_ADMIN';
}

/** Convenience helper: is this user an admin-tier role? */
export function isAdminTier(role: Role) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'HR';
}

/**
 * Verify the signed-in Clerk user exists in our allowlist (i.e. was created
 * by the seed script or via the admin invite flow).
 *
 * Returns the full user row so the layout only needs one DB round-trip.
 * Returns null when there is no session. Redirects to /not-authorized when
 * the Clerk user has no matching row in Postgres.
 */
export async function ensureUserInDb() {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;

  // Signed into Clerk but not in our allowlist — hard block.
  redirect('/not-authorized');
}
