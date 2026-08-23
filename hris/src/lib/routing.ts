/**
 * Approval routing under the multi-role model.
 *
 * Rule: every leave request notifies exactly the users who hold the HR role
 * (except the requester if they happen to also be HR).
 *
 *   Employees      - notifications only for their OWN leave decisions
 *                    (handled by the approve/reject routes, not here)
 *   HR             - receives every approval-worthy notification
 *   Admin          - silent; retains approval power but no notifications
 *   Super Admin    - silent by default; falls back as safety net if no HR
 *                    user is active so requests can't fall through the cracks
 */
import type { User } from '@prisma/client';
import { hasRole } from './roles';

export interface ApprovalRecipients {
  to: User[];
  cc: User[];
}

export function approvalRecipients(applicant: User, allUsers: User[]): ApprovalRecipients {
  const active = allUsers.filter((u) => u.isActive);
  // Notify every HR-role holder INCLUDING the applicant if they happen to
  // hold HR themselves. This handles the multi-role case (e.g. a COO who is
  // both Admin and HR applying for their own leave), and also covers the
  // Super Admin QA scenario where a single account holds every role.
  const hr = active.filter((u) => hasRole(u, 'HR'));

  if (hr.length > 0) {
    return { to: hr, cc: [] };
  }

  // Rescue path: no active HR user at all. Notify Super Admin so the
  // request doesn't fall through the cracks. Admin-only users stay silent.
  const rescue = active.filter((u) => hasRole(u, 'SUPER_ADMIN'));
  return { to: rescue, cc: [] };
}
