/**
 * Multi-role helpers. A user can hold one or more roles simultaneously
 * (e.g. a COO with both ADMIN and HR). `roles` on the User model is the
 * source of truth for permissions; the older single `role` field is
 * kept denormalized to the highest-ranked entry in `roles` - safe to
 * use only for display (badge color, top-bar label, etc).
 */
import type { Role } from '@prisma/client';

/** Ranked highest -> lowest. Used to compute a display "primary" role. */
export const ROLE_HIERARCHY: Role[] = ['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'];

/**
 * Which role, out of a user's set, should render as their "primary"?
 * Highest-ranked wins. Safe default: EMPLOYEE.
 */
export function primaryRole(roles: readonly Role[] | null | undefined): Role {
  if (!roles || roles.length === 0) return 'EMPLOYEE';
  for (const r of ROLE_HIERARCHY) if (roles.includes(r)) return r;
  return 'EMPLOYEE';
}

/** Prefer `roles`; fall back to `[role]` for pre-migration edge cases. */
export function effectiveRoles(u: { role: Role; roles?: Role[] | null }): Role[] {
  if (u.roles && u.roles.length > 0) return u.roles;
  return [u.role];
}

export function hasRole(u: { role: Role; roles?: Role[] | null }, r: Role): boolean {
  return effectiveRoles(u).includes(r);
}

/** Anyone with review power over leave/extra-work requests. */
export function canApproveLeave(u: { role: Role; roles?: Role[] | null }): boolean {
  return (
    hasRole(u, 'HR') ||
    hasRole(u, 'ADMIN') ||
    hasRole(u, 'SUPER_ADMIN') ||
    hasRole(u, 'LINE_MANAGER')
  );
}

/**
 * Which role sets the current actor can grant to another user.
 *   SUPER_ADMIN / ADMIN -> any role
 *   HR                  -> HR + LINE_MANAGER + EMPLOYEE
 *   LINE_MANAGER        -> nothing
 *   EMPLOYEE            -> nothing
 */
export function assignableRoles(actor: { role: Role; roles?: Role[] | null }): Role[] {
  if (hasRole(actor, 'SUPER_ADMIN') || hasRole(actor, 'ADMIN'))
    return ['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'];
  if (hasRole(actor, 'HR')) return ['HR', 'LINE_MANAGER', 'EMPLOYEE'];
  return [];
}

/**
 * Guard against illegal target role sets. Returns null if valid or a
 * short human message otherwise.
 */
export function validateRoleAssignment(
  actor: { role: Role; roles?: Role[] | null },
  targetRoles: Role[],
): string | null {
  if (targetRoles.length === 0) return 'A user must hold at least one role.';
  const allowed = new Set(assignableRoles(actor));
  const bad = targetRoles.filter((r) => !allowed.has(r));
  if (bad.length > 0) {
    return `You cannot grant these roles: ${bad.join(', ')}.`;
  }
  return null;
}
