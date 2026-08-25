/**
 * Approval routing under the multi-role model (Phase 7 hierarchy).
 *
 * Routing table (who gets notified when a leave/extra-work request is submitted):
 *
 *   EMPLOYEE       -> All HR + Super Admin
 *   LINE_MANAGER   -> All HR + Super Admin (not peer line managers)
 *   HR             -> All Super Admin + other HR
 *   ADMIN          -> All Super Admin
 *   SUPER_ADMIN    -> All HR (rescue if no HR: log warning, empty list)
 *
 * On top of that table: whoever the applicant reports to (`lineManagerId`) is
 * always prepended, whatever the applicant's own role is. That keeps a
 * manager-of-managers chain intact and means the reporting line is honoured
 * even for an Admin or Super Admin who has been placed under a Line Manager.
 *
 * Never route to Admin-only users (they check the requests page manually).
 * Never route to Employees (their own decision notifications are handled
 * by the approve/reject routes, not here).
 */
import type { User } from '@prisma/client';
import { hasRole, primaryRole } from './roles';
import { checkPermission } from './permissions';

export interface ApprovalRecipients {
  to: User[];
  cc: User[];
}

/**
 * Computes who gets notified for a new request.
 * Filters the final list by checking the given permissionKey if provided.
 */
export async function approvalRecipients(
  applicant: User,
  allUsers: User[],
  permissionKey?: string,
): Promise<ApprovalRecipients> {
  const active = allUsers.filter((u) => u.isActive && u.id !== applicant.id);
  const hr = active.filter((u) => hasRole(u, 'HR'));
  const superAdmins = active.filter((u) => hasRole(u, 'SUPER_ADMIN'));

  const applicantPrimary = primaryRole(applicant.roles?.length ? applicant.roles : [applicant.role]);

  let toUsers: User[] = [];
  const ccUsers: User[] = [];

  switch (applicantPrimary) {
    case 'EMPLOYEE': {
      toUsers = [...hr, ...superAdmins];
      break;
    }

    case 'LINE_MANAGER': {
      // All HR + Super Admin (not peer line managers)
      toUsers = [...hr, ...superAdmins];
      break;
    }

    case 'HR': {
      // All Super Admin + other HR (excluding the applicant, already filtered)
      toUsers = [...superAdmins, ...hr];
      break;
    }

    case 'ADMIN': {
      // All Super Admin only
      toUsers = [...superAdmins];
      break;
    }

    case 'SUPER_ADMIN': {
      // All HR (rescue: log warning if no HR)
      if (hr.length === 0 && !applicant.lineManagerId) {
        console.warn(
          '[routing] Super Admin submitted a request but no active HR user exists to receive it.',
        );
      }
      toUsers = [...hr];
      break;
    }
  }

  // The applicant's own line manager reviews first, whatever role the
  // applicant holds. Put them at the head of the list so they become the
  // named reviewer on the outgoing email.
  if (applicant.lineManagerId) {
    const lm = active.find((u) => u.id === applicant.lineManagerId);
    if (lm) toUsers.unshift(lm);
  }

  toUsers = dedupe(toUsers);

  // Drop anyone whose role has the matching notification permission turned off
  // in the permission matrix.
  if (permissionKey) {
    const toFiltered: User[] = [];
    for (const u of toUsers) {
      if (await checkPermission(u, permissionKey)) toFiltered.push(u);
    }

    const ccFiltered: User[] = [];
    for (const u of ccUsers) {
      if (await checkPermission(u, permissionKey)) ccFiltered.push(u);
    }

    return { to: toFiltered, cc: ccFiltered };
  }

  return { to: toUsers, cc: ccUsers };
}

/** Remove duplicate users by id, preserving order. */
function dedupe(users: User[]): User[] {
  const seen = new Set<string>();
  return users.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}
