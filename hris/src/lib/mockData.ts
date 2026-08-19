// Mock data has been removed. This system now uses real users seeded in
// Clerk + Neon (see prisma/seed.ts). Legacy exports remain as empty arrays
// so pages that still reference them render an empty state until the
// corresponding API routes come online in Phase 2/3/4.

import type {
  User,
  LeaveBalance,
  LeaveRequest,
  Holiday,
  AttendanceRecord,
  Notification,
} from './types';

export const users: User[] = [];
export const initialBalances: LeaveBalance[] = [];
export const initialRequests: LeaveRequest[] = [];
export const initialHolidays: Holiday[] = [];
export const initialAttendance: AttendanceRecord[] = [];
export const initialNotifications: Notification[] = [];
