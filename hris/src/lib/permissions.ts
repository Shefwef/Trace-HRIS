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
 */
import type { Role } from '@prisma/client';
import { prisma } from './db';
import { effectiveRoles } from './roles';

// ─── Permission Catalog ──────────────────────────────────

export const ACTION_PERMISSIONS = [
  'leave.approve',
  'leave.reject',
  'leave.cancel_others',
  'extra_work.approve',
  'extra_work.reject',
  'holiday.create',
  'holiday.edit',
  'holiday.delete',
  'holiday.send_notice',
  'employee.invite',
  'employee.deactivate',
  'employee.assign_role',
  'employee.assign_line_manager',
  'settings.edit',
  'settings.edit_qa_redirect',
  'reports.company',
  'reports.per_employee_others',
  'audit.view',
  'system.view',
] as const;

export const NOTIFICATION_PERMISSIONS = [
  'notifications.leave_pending',
  'notifications.leave_decision',
  'notifications.extra_work_pending',
  'notifications.holiday_notice',
  'notifications.employee_invited',
] as const;

export const ALL_PERMISSIONS = [
  ...ACTION_PERMISSIONS,
  ...NOTIFICATION_PERMISSIONS,
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** Human-readable labels for display in the /admin/permissions grid. */
export const PERMISSION_LABELS: Record<string, string> = {
  'leave.approve': 'Approve leave requests',
  'leave.reject': 'Reject leave requests',
  'leave.cancel_others': 'Cancel others\' leave requests',
  'extra_work.approve': 'Approve extra work logs',
  'extra_work.reject': 'Reject extra work logs',
  'holiday.create': 'Create holidays',
  'holiday.edit': 'Edit holidays',
  'holiday.delete': 'Delete holidays',
  'holiday.send_notice': 'Send holiday notices',
  'employee.invite': 'Invite new employees',
  'employee.deactivate': 'Deactivate employees',
  'employee.assign_role': 'Assign roles to employees',
  'employee.assign_line_manager': 'Assign line managers',
  'settings.edit': 'Edit system settings',
  'settings.edit_qa_redirect': 'Edit QA redirect email',
  'reports.company': 'View company-wide reports',
  'reports.per_employee_others': 'View other employees\' reports',
  'audit.view': 'View audit logs',
  'system.view': 'View system health',
  'notifications.leave_pending': 'Receive leave pending notifications',
  'notifications.leave_decision': 'Receive leave decision notifications',
  'notifications.extra_work_pending': 'Receive extra work pending notifications',
  'notifications.holiday_notice': 'Receive holiday notices',
  'notifications.employee_invited': 'Receive employee invited notifications',
};

/** Group labels for the permission grid. */
export const PERMISSION_GROUPS: { label: string; permissions: string[] }[] = [
  {
    label: 'Leave Management',
    permissions: ['leave.approve', 'leave.reject', 'leave.cancel_others'],
  },
  {
    label: 'Extra Work',
    permissions: ['extra_work.approve', 'extra_work.reject'],
  },
  {
    label: 'Holidays',
    permissions: ['holiday.create', 'holiday.edit', 'holiday.delete', 'holiday.send_notice'],
  },
  {
    label: 'Employees',
    permissions: ['employee.invite', 'employee.deactivate', 'employee.assign_role', 'employee.assign_line_manager'],
  },
  {
    label: 'Settings & System',
    permissions: ['settings.edit', 'settings.edit_qa_redirect', 'reports.company', 'reports.per_employee_others', 'audit.view', 'system.view'],
  },
  {
    label: 'Notifications',
    permissions: ['notifications.leave_pending', 'notifications.leave_decision', 'notifications.extra_work_pending', 'notifications.holiday_notice', 'notifications.employee_invited'],
  },
];

// ─── Default Matrix ──────────────────────────────────────

/**
 * Sensible defaults that match the pre-Phase-7 behavior. Only rows
 * that are missing from the DB will be seeded; admin overrides are
 * never touched.
 */
export const DEFAULT_MATRIX: Record<Role, Record<string, boolean>> = {
  SUPER_ADMIN: Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, true])),
  ADMIN: {
    'leave.approve': true,
    'leave.reject': true,
    'leave.cancel_others': true,
    'extra_work.approve': true,
    'extra_work.reject': true,
    'holiday.create': true,
    'holiday.edit': true,
    'holiday.delete': true,
    'holiday.send_notice': true,
    'employee.invite': true,
    'employee.deactivate': true,
    'employee.assign_role': true,
    'employee.assign_line_manager': true,
    'settings.edit': true,
    'settings.edit_qa_redirect': false,
    'reports.company': true,
    'reports.per_employee_others': true,
    'audit.view': false,
    'system.view': false,
    // Admin receives no notifications by default (checks pages manually)
    'notifications.leave_pending': false,
    'notifications.leave_decision': false,
    'notifications.extra_work_pending': false,
    'notifications.holiday_notice': false,
    'notifications.employee_invited': false,
  },
  HR: {
    'leave.approve': true,
    'leave.reject': true,
    'leave.cancel_others': true,
    'extra_work.approve': true,
    'extra_work.reject': true,
    'holiday.create': true,
    'holiday.edit': true,
    'holiday.delete': true,
    'holiday.send_notice': true,
    'employee.invite': true,
    'employee.deactivate': true,
    'employee.assign_role': true, // HR+EMPLOYEE only; ADMIN/SUPER_ADMIN promotion blocked server-side
    'employee.assign_line_manager': true,
    'settings.edit': true,
    'settings.edit_qa_redirect': false,
    'reports.company': true,
    'reports.per_employee_others': true,
    'audit.view': false,
    'system.view': false,
    'notifications.leave_pending': true,
    'notifications.leave_decision': true,
    'notifications.extra_work_pending': true,
    'notifications.holiday_notice': true,
    'notifications.employee_invited': true,
  },
  LINE_MANAGER: {
    'leave.approve': true,    // team only - enforced server-side
    'leave.reject': true,     // team only
    'leave.cancel_others': false,
    'extra_work.approve': true,  // team only
    'extra_work.reject': true,   // team only
    'holiday.create': false,
    'holiday.edit': false,
    'holiday.delete': false,
    'holiday.send_notice': false,
    'employee.invite': false,
    'employee.deactivate': false,
    'employee.assign_role': false,
    'employee.assign_line_manager': false,
    'settings.edit': false,
    'settings.edit_qa_redirect': false,
    'reports.company': false,
    'reports.per_employee_others': true, // team only
    'audit.view': false,
    'system.view': false,
    'notifications.leave_pending': true,
    'notifications.leave_decision': true,
    'notifications.extra_work_pending': true,
    'notifications.holiday_notice': true,
    'notifications.employee_invited': false,
  },
  EMPLOYEE: {
    'leave.approve': false,
    'leave.reject': false,
    'leave.cancel_others': false,
    'extra_work.approve': false,
    'extra_work.reject': false,
    'holiday.create': false,
    'holiday.edit': false,
    'holiday.delete': false,
    'holiday.send_notice': false,
    'employee.invite': false,
    'employee.deactivate': false,
    'employee.assign_role': false,
    'employee.assign_line_manager': false,
    'settings.edit': false,
    'settings.edit_qa_redirect': false,
    'reports.company': false,
    'reports.per_employee_others': false,
    'audit.view': false,
    'system.view': false,
    'notifications.leave_pending': false,
    'notifications.leave_decision': true, // own only
    'notifications.extra_work_pending': false,
    'notifications.holiday_notice': true,
    'notifications.employee_invited': false,
  },
};

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
