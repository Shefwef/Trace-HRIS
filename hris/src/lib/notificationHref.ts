/**
 * Given a notification, produce the URL a user should be sent to when they
 * click it. Kept as a pure function so it can be tested and used in both
 * the topbar and any inline notification list we add later.
 *
 * Routing rules:
 *   • *_PENDING          → approver's queue at /admin/requests
 *   • LEAVE_*             → employee's own leave list at /leaves
 *   • EXTRA_WORK_APPROVED/REJECTED, REPLACEMENT_EARNED → /attendance
 *   • HOLIDAY_NOTICE      → /calendar
 *   • Anything else       → home (/)
 *
 * `highlight` query param lets the destination page scroll to / expand the
 * relevant row; pages that ignore it still render correctly.
 */
export interface HrefableNotification {
  type: string;
  referenceType: string | null;
  referenceId: string | null;
}

export function notificationHref(n: HrefableNotification): string {
  const ref = n.referenceId ? `?highlight=${encodeURIComponent(n.referenceId)}` : '';

  // Explicit override: managers get audit copies of grants they issued (or an
  // HR user gets a copy of a LM-issued grant). Route them to the admin queue
  // so the click is useful, not the employee's own list.
  if (n.referenceType === 'admin_requests') return `/admin/requests${ref}`;

  switch (n.type) {
    // Approver-facing: someone submitted, please review
    case 'LEAVE_PENDING':
    case 'EXTRA_WORK_PENDING':
      return `/admin/requests${ref}`;

    // Employee-facing: your leave request was decided (or a manager granted you one)
    case 'LEAVE_APPROVED':
    case 'LEAVE_REJECTED':
      return `/leaves${ref}`;

    // Employee-facing: extra work outcome shows on attendance
    case 'EXTRA_WORK_APPROVED':
    case 'EXTRA_WORK_REJECTED':
    case 'REPLACEMENT_EARNED':
      return `/attendance${ref}`;

    case 'HOLIDAY_NOTICE':
      return '/calendar';

    case 'ATTENDANCE_REMINDER':
      return '/attendance';

    default:
      return '/';
  }
}
