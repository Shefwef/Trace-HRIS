/**
 * Runtime permission system. The five roles are fixed (no creating new roles),
 * but what each role is allowed to do is configurable by Super Admin via
 * /admin/permissions. Permissions are stored in the `role_permissions` table
 * and cached in-memory with a 60-second TTL.
 *
 * Two categories:
 *   - Actions: "leave.approve", "holiday.create", etc.
 *   - Notifications: "notifications.leave_pending", etc. (toggle whether
 *     the role receives that notification type)
 *
 * Static catalog and DEFAULT_MATRIX live in permissionsMeta.ts so Client
 * Components can import them without pulling in Prisma.
 */
import type { Role } from '@prisma/client';
import { prisma } from './db';
import { effectiveRoles } from './roles';
import { ALL_PERMISSIONS, DEFAULT_MATRIX } from './permissionsMeta';
export {
  ACTION_PERMISSIONS, NOTIFICATION_PERMISSIONS, ALL_PERMISSIONS,
  PERMISSION_LABELS, PERMISSION_GROUPS, DEFAULT_MATRIX,
  type Permission,
} from './permissionsMeta';

// ─── In-memory cache ─────────────────────────────────────

interface CacheEntry {
  data: Map<string, boolean>; // key = "ROLE:permission"
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
let cache: CacheEntry | null = null;

async function loadPermissions(): Promise<Map<string, boolean>> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;

  const rows = await prisma.rolePermission.findMany();
  const map = new Map<string, boolean>();
  for (const row of rows) {
    map.set(`${row.role}:${row.permission}`, row.enabled);
  }
  cache = { data: map, expiresAt: Date.now() + CACHE_TTL_MS };
  return map;
}

/** Invalidate the in-memory cache (call after admin toggles). */
export function invalidatePermissionCache(): void {
  cache = null;
}

// ─── Runtime check ───────────────────────────────────────

/**
 * Check if the actor has a given permission enabled for any of their roles.
 * Falls back to the DEFAULT_MATRIX if no DB row exists for a (role, perm) pair
 * (e.g. before sync-roles seeds the table for the first time).
 */
export async function checkPermission(
  actor: { role: Role; roles?: Role[] | null },
  permission: string,
): Promise<boolean> {
  const perms = await loadPermissions();
  const roles = effectiveRoles(actor);

  for (const r of roles) {
    const key = `${r}:${permission}`;
    if (perms.has(key)) {
      if (perms.get(key)) return true;
    } else {
      // Fall back to compiled default
      const defaults = DEFAULT_MATRIX[r];
      if (defaults && defaults[permission]) return true;
    }
  }

  return false;
}

/**
 * Synchronous check against the DEFAULT_MATRIX only (no DB hit).
 * Useful in client-side code or places where async isn't viable.
 */
export function checkPermissionSync(
  actor: { role: Role; roles?: Role[] | null },
  permission: string,
): boolean {
  const roles: readonly Role[] =
    actor.roles && actor.roles.length > 0 ? actor.roles : [actor.role];
  for (const r of roles) {
    const defaults = DEFAULT_MATRIX[r];
    if (defaults && defaults[permission]) return true;
  }
  return false;
}

// ─── Seeding helper ──────────────────────────────────────

/**
 * Upsert all default permission rows. Only creates missing combos;
 * never overwrites an admin's toggle. Safe to run idempotently.
 */
export async function seedPermissionDefaults(): Promise<number> {
  let created = 0;
  const roles = Object.keys(DEFAULT_MATRIX) as Role[];
  for (const role of roles) {
    const perms = DEFAULT_MATRIX[role];
    for (const [permission, enabled] of Object.entries(perms)) {
      const existing = await prisma.rolePermission.findUnique({
        where: { role_permission: { role, permission } },
      });
      if (!existing) {
        await prisma.rolePermission.create({
          data: { role, permission, enabled },
        });
        created++;
      }
    }
  }
  return created;
}
