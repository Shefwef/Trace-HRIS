/**
 * Approval routing rules per HRIS_Implementation.md + ARCHITECTURE.md §5.
 *
 * When an EMPLOYEE applies: TO = HR staff, CC = CEO (Admin).
 * When an HR applies:       TO = other HR + CEO, CC = Super Admin.
 * When an ADMIN applies:    TO = Super Admin + HR, CC = (none).
 * When a SUPER_ADMIN applies: TO = HR + CEO, CC = (none).
 *
 * "CEO" is any user with role=ADMIN whose designation contains "CEO"
 * (case-insensitive). If not found, we fall back to any ADMIN.
 */
import type { User } from '@prisma/client';

export interface ApprovalRecipients {
  to: User[];
  cc: User[];
}

export function approvalRecipients(applicant: User, allUsers: User[]): ApprovalRecipients {
  const active = allUsers.filter((u) => u.isActive);
  const hr = active.filter((u) => u.role === 'HR');
  const admins = active.filter((u) => u.role === 'ADMIN');
  const superAdmins = active.filter((u) => u.role === 'SUPER_ADMIN');

  const ceo =
    admins.find((u) => (u.designation ?? '').toLowerCase().includes('ceo')) ??
    admins[0];

  switch (applicant.role) {
    case 'EMPLOYEE':
      return { to: hr, cc: ceo ? [ceo] : [] };
    case 'HR': {
      const otherHR = hr.filter((u) => u.id !== applicant.id);
      const to = ceo ? [...otherHR, ceo] : otherHR;
      return { to, cc: superAdmins };
    }
    case 'ADMIN': {
      const to = [...superAdmins, ...hr];
      return { to, cc: [] };
    }
    case 'SUPER_ADMIN': {
      const to = [...hr, ...(ceo ? [ceo] : [])];
      return { to, cc: [] };
    }
    default:
      return { to: [], cc: [] };
  }
}
