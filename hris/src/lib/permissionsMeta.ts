/**
 * Static permission catalog — no server imports, safe to use in Client Components.
 *
 * The runtime check functions (checkPermission, seedPermissionDefaults, …) live in
 * permissions.ts alongside the Prisma cache. Anything that only needs the catalog
 * or DEFAULT_MATRIX (e.g. the admin UI grid) imports from here instead.
 */
import type { Role } from '@prisma/client';

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
  'work_location.change_own',
  'work_location.view_team',
  'work_location.view_all',
  'work_location.correct',
  'biometric.view',
  'biometric.manage',
  'biometric.simulate',
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
  'work_location.change_own': 'Change own work location',
  'work_location.view_team': 'View team work locations',
  'work_location.view_all': 'View all work locations',
  'work_location.correct': 'Correct work location records',
  'biometric.view': 'View biometric devices & punch log',
  'biometric.manage': 'Register devices & map employees',
  'biometric.simulate': 'Simulate biometric punches (QA)',
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
    label: 'Work Location',
    permissions: ['work_location.change_own', 'work_location.view_team', 'work_location.view_all', 'work_location.correct'],
  },
  {
    label: 'Biometric',
    permissions: ['biometric.view', 'biometric.manage', 'biometric.simulate'],
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
    'audit.view': true,
    'system.view': false,
    'work_location.change_own': true,
    'work_location.view_team': true,
    'work_location.view_all': true,
    'work_location.correct': true,
    'biometric.view': true,
    'biometric.manage': true,
    'biometric.simulate': false,
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
    'audit.view': true,
    'system.view': false,
    'work_location.change_own': true,
    'work_location.view_team': true,
    'work_location.view_all': true,
    'work_location.correct': true,
    'biometric.view': true,
    'biometric.manage': true,
    'biometric.simulate': false,
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
    'audit.view': true,
    'system.view': false,
    'work_location.change_own': true,
    'work_location.view_team': true,  // team only - enforced server-side
    'work_location.view_all': false,
    'work_location.correct': false,
    'biometric.view': false,
    'biometric.manage': false,
    'biometric.simulate': false,
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
    'work_location.change_own': true,  // the whole point: self-service
    'work_location.view_team': false,
    'work_location.view_all': false,
    'work_location.correct': false,
    'biometric.view': false,
    'biometric.manage': false,
    'biometric.simulate': false,
    'notifications.leave_pending': false,
    'notifications.leave_decision': true, // own only
    'notifications.extra_work_pending': false,
    'notifications.holiday_notice': true,
    'notifications.employee_invited': false,
  },
};
