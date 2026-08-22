/**
 * Approval routing under the multi-role model.
 *
 * Rule: every leave request notifies exactly the users who hold the HR role
 * (except the requester if they happen to also be HR). Admin-only users are
 * intentionally silent — they retain approval power but do not receive
 * notifications or emails.
 *
 * If nobody in the system holds the HR role we fall back to notifying any
 * ADMIN or SUPER_ADMIN so the request doesn't fall through the cracks. That
 * shouldn't happen in practice, but it's a safe rescue path.
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

  // Rescue path: no HR user available. Any active Admin/Super Admin (except
  // the requester) picks it up. Never CCs anyone.
  const fallback = active.filter(
    (u) => u.id !== applicant.id && (hasRole(u, 'ADMIN') || hasRole(u, 'SUPER_ADMIN')),
  );
  return { to: fallback, cc: [] };
}
