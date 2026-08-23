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
  const hr = active.filter((u) => hasRole(u, 'HR') && u.id !== applicant.id);

  if (hr.length > 0) {
    return { to: hr, cc: [] };
  }

  // Rescue path: no active HR user available. Notify Super Admin only so
  // the request doesn't fall through the cracks. Admin-only users stay
  // silent per policy.
  const rescue = active.filter(
    (u) => u.id !== applicant.id && hasRole(u, 'SUPER_ADMIN'),
  );
  return { to: rescue, cc: [] };
}
