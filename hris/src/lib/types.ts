export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE';

export type LeaveType = 'CASUAL' | 'SICK' | 'REPLACEMENT';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type HalfDaySlot = 'MORNING' | 'AFTERNOON';
export type NotificationChannel = 'EMAIL' | 'IN_APP';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  department: string;
  designation: string;
  employeeIdCode: string;
  avatarColor: string;
  initials: string;
  cycleStartMonth: number;
  cycleStartDay: number;
}

export interface LeaveBalance {
  employeeId: string;
  cycleYear: number;
  cycleStartDate: string;
  cycleEndDate: string;
  casualTotal: number;
  casualUsed: number;
  casualPending: number;
  sickTotal: number;
  sickUsed: number;
  sickPending: number;
  replacementBalance: number;
  overtimeHoursBank: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  halfDaySlot?: HalfDaySlot;
  durationDays: number;
  reason: string;
  description?: string;
  attachmentName?: string;
  channels: NotificationChannel[];
  customMessage?: string;
  status: LeaveStatus;
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'HALF_DAY'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'WEEKEND';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  clockInTime?: string;
  clockOutTime?: string;
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
  overtimeMinutes: number;
  status: AttendanceStatus;
  source: 'MANUAL' | 'BIOMETRIC';
  breaks: { start: string; end?: string }[];
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  isRecurring: boolean;
  description?: string;
  notificationScheduled: boolean;
  notificationSendAt?: string;
  recipients: 'ALL' | 'HR_ONLY' | 'STAFF_ONLY' | 'CUSTOM';
  notificationSentAt?: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  type:
    | 'LEAVE_APPROVED'
    | 'LEAVE_REJECTED'
    | 'LEAVE_PENDING'
    | 'REPLACEMENT_EARNED'
    | 'HOLIDAY_NOTICE'
    | 'ATTENDANCE_REMINDER'
    | 'SYSTEM';
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
  isRead: boolean;
  createdAt: string;
}
