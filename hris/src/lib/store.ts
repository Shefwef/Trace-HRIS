import { create } from 'zustand';
import type {
  User,
  LeaveBalance,
  LeaveRequest,
  Holiday,
  AttendanceRecord,
  Notification,
  LeaveType,
  NotificationChannel,
} from './types';
import {
  users as seedUsers,
  initialBalances,
  initialRequests,
  initialHolidays,
  initialAttendance,
  initialNotifications,
} from './mockData';
import { uid } from './utils';

interface ToastMsg {
  id: string;
  kind: 'success' | 'error' | 'info';
  title: string;
  body?: string;
}

interface Store {
  currentUserId: string | null;
  users: User[];
  balances: LeaveBalance[];
  requests: LeaveRequest[];
  holidays: Holiday[];
  attendance: AttendanceRecord[];
  notifications: Notification[];
  toasts: ToastMsg[];

  login: (userId: string) => void;
  logout: () => void;
  switchUser: (userId: string) => void;
  currentUser: () => User | null;

  balanceFor: (employeeId: string) => LeaveBalance | undefined;
  requestsFor: (employeeId: string) => LeaveRequest[];

  submitLeave: (
    input: Omit<LeaveRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>
  ) => LeaveRequest;
  cancelLeave: (requestId: string) => void;
  approveLeave: (requestId: string, note?: string) => void;
  rejectLeave: (requestId: string, note: string) => void;

  clockIn: (employeeId: string) => void;
  clockOut: (employeeId: string) => void;
  startBreak: (employeeId: string) => void;
  endBreak: (employeeId: string) => void;

  markNotificationRead: (id: string) => void;
  markAllRead: (userId: string) => void;

  addToast: (t: Omit<ToastMsg, 'id'>) => void;
  dismissToast: (id: string) => void;

  createHoliday: (h: Omit<Holiday, 'id'>) => void;
  updateHoliday: (id: string, patch: Partial<Holiday>) => void;
  deleteHoliday: (id: string) => void;
  sendHolidayNotice: (id: string) => void;
}

const STANDARD_MINUTES_PER_DAY = 8 * 60;

const STORAGE_KEY = 'hris_current_user';
function loadUserId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'u-nazmul';
  } catch {
    return 'u-nazmul';
  }
}
function saveUserId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const useStore = create<Store>((set, get) => ({
  currentUserId: loadUserId(),
  users: seedUsers,
  balances: initialBalances,
  requests: initialRequests,
  holidays: initialHolidays,
  attendance: initialAttendance,
  notifications: initialNotifications,
  toasts: [],

  login: (userId) => { saveUserId(userId); set({ currentUserId: userId }); },
  logout: () => { saveUserId(null); set({ currentUserId: null }); },
  switchUser: (userId) => { saveUserId(userId); set({ currentUserId: userId }); },
  currentUser: () => {
    const id = get().currentUserId;
    if (!id) return null;
    return get().users.find((u) => u.id === id) ?? null;
  },

  balanceFor: (employeeId) =>
    get().balances.find((b) => b.employeeId === employeeId),
  requestsFor: (employeeId) =>
    get().requests.filter((r) => r.employeeId === employeeId),

  submitLeave: (input) => {
    const now = new Date().toISOString();
    const req: LeaveRequest = {
      ...input,
      id: 'lr-' + uid(),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    set((s) => {
      const balances = s.balances.map((b) => {
        if (b.employeeId !== input.employeeId) return b;
        if (input.leaveType === 'CASUAL')
          return { ...b, casualPending: b.casualPending + input.durationDays };
        if (input.leaveType === 'SICK')
          return { ...b, sickPending: b.sickPending + input.durationDays };
        return b;
      });
      const admins = s.users.filter((u) => u.role === 'ADMIN');
      const newNotifs: Notification[] = admins.map((a) => ({
        id: 'n-' + uid(),
        recipientId: a.id,
        type: 'LEAVE_PENDING',
        title: 'New leave request awaiting review',
        body: `${s.users.find((u) => u.id === input.employeeId)?.fullName ?? ''} submitted a ${input.leaveType.toLowerCase()} leave request.`,
        referenceType: 'leave_request',
        referenceId: req.id,
        isRead: false,
        createdAt: now,
      }));
      return {
        requests: [req, ...s.requests],
        balances,
        notifications: [...newNotifs, ...s.notifications],
        toasts: [
          {
            id: uid(),
            kind: 'success',
            title: 'Leave request submitted',
            body: 'You will be notified once it is reviewed.',
          },
          ...s.toasts,
        ],
      };
    });
    return req;
  },

  cancelLeave: (requestId) =>
    set((s) => {
      const req = s.requests.find((r) => r.id === requestId);
      if (!req || req.status !== 'PENDING') return s;
      const balances = s.balances.map((b) => {
        if (b.employeeId !== req.employeeId) return b;
        if (req.leaveType === 'CASUAL')
          return {
            ...b,
            casualPending: Math.max(0, b.casualPending - req.durationDays),
          };
        if (req.leaveType === 'SICK')
          return {
            ...b,
            sickPending: Math.max(0, b.sickPending - req.durationDays),
          };
        return b;
      });
      const requests = s.requests.map((r) =>
        r.id === requestId ? { ...r, status: 'CANCELLED' as const } : r
      );
      return {
        requests,
        balances,
        toasts: [
          { id: uid(), kind: 'info', title: 'Leave request cancelled' },
          ...s.toasts,
        ],
      };
    }),

  approveLeave: (requestId, note) =>
    set((s) => {
      const req = s.requests.find((r) => r.id === requestId);
      const admin = s.users.find((u) => u.id === s.currentUserId);
      if (!req || req.status !== 'PENDING' || !admin) return s;
      const now = new Date().toISOString();
      const balances = s.balances.map((b) => {
        if (b.employeeId !== req.employeeId) return b;
        if (req.leaveType === 'CASUAL')
          return {
            ...b,
            casualUsed: b.casualUsed + req.durationDays,
            casualPending: Math.max(0, b.casualPending - req.durationDays),
          };
        if (req.leaveType === 'SICK')
          return {
            ...b,
            sickUsed: b.sickUsed + req.durationDays,
            sickPending: Math.max(0, b.sickPending - req.durationDays),
          };
        if (req.leaveType === 'REPLACEMENT')
          return {
            ...b,
            replacementBalance: Math.max(
              0,
              b.replacementBalance - req.durationDays
            ),
          };
        return b;
      });
      const requests = s.requests.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'APPROVED' as const,
              adminNote: note,
              reviewedBy: admin.id,
              reviewedAt: now,
              updatedAt: now,
            }
          : r
      );
      const employeeNotif: Notification = {
        id: 'n-' + uid(),
        recipientId: req.employeeId,
        type: 'LEAVE_APPROVED',
        title: 'Your leave request was approved',
        body: `${admin.fullName} approved your ${req.leaveType.toLowerCase()} leave (${req.durationDays} day${req.durationDays === 1 ? '' : 's'}).`,
        referenceType: 'leave_request',
        referenceId: req.id,
        isRead: false,
        createdAt: now,
      };
      return {
        requests,
        balances,
        notifications: [employeeNotif, ...s.notifications],
        toasts: [
          {
            id: uid(),
            kind: 'success',
            title: 'Leave approved',
            body: `${req.durationDays} day${req.durationDays === 1 ? '' : 's'} deducted from balance.`,
          },
          ...s.toasts,
        ],
      };
    }),

  rejectLeave: (requestId, note) =>
    set((s) => {
      const req = s.requests.find((r) => r.id === requestId);
      const admin = s.users.find((u) => u.id === s.currentUserId);
      if (!req || req.status !== 'PENDING' || !admin) return s;
      const now = new Date().toISOString();
      const balances = s.balances.map((b) => {
        if (b.employeeId !== req.employeeId) return b;
        if (req.leaveType === 'CASUAL')
          return {
            ...b,
            casualPending: Math.max(0, b.casualPending - req.durationDays),
          };
        if (req.leaveType === 'SICK')
          return {
            ...b,
            sickPending: Math.max(0, b.sickPending - req.durationDays),
          };
        return b;
      });
      const requests = s.requests.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'REJECTED' as const,
              adminNote: note,
              reviewedBy: admin.id,
              reviewedAt: now,
              updatedAt: now,
            }
          : r
      );
      const employeeNotif: Notification = {
        id: 'n-' + uid(),
        recipientId: req.employeeId,
        type: 'LEAVE_REJECTED',
        title: 'Your leave request was rejected',
        body: `${admin.fullName} declined your ${req.leaveType.toLowerCase()} leave. Reason: ${note}`,
        referenceType: 'leave_request',
        referenceId: req.id,
        isRead: false,
        createdAt: now,
      };
      return {
        requests,
        balances,
        notifications: [employeeNotif, ...s.notifications],
        toasts: [
          { id: uid(), kind: 'info', title: 'Leave rejected' },
          ...s.toasts,
        ],
      };
    }),

  clockIn: (employeeId) =>
    set((s) => {
      const date = new Date().toISOString().slice(0, 10);
      const existing = s.attendance.find(
        (a) => a.employeeId === employeeId && a.date === date
      );
      if (existing && existing.clockInTime) return s;
      const now = new Date().toISOString();
      if (existing) {
        return {
          attendance: s.attendance.map((a) =>
            a === existing
              ? { ...a, clockInTime: now, status: 'PRESENT' as const }
              : a
          ),
          toasts: [
            { id: uid(), kind: 'success', title: 'Clocked in' },
            ...s.toasts,
          ],
        };
      }
      return {
        attendance: [
          {
            id: 'att-' + uid(),
            employeeId,
            date,
            clockInTime: now,
            totalWorkedMinutes: 0,
            totalBreakMinutes: 0,
            overtimeMinutes: 0,
            status: 'PRESENT',
            source: 'MANUAL',
            breaks: [],
          },
          ...s.attendance,
        ],
        toasts: [
          { id: uid(), kind: 'success', title: 'Clocked in' },
          ...s.toasts,
        ],
      };
    }),

  clockOut: (employeeId) =>
    set((s) => {
      const date = new Date().toISOString().slice(0, 10);
      const rec = s.attendance.find(
        (a) => a.employeeId === employeeId && a.date === date
      );
      if (!rec || !rec.clockInTime || rec.clockOutTime) return s;
      const now = new Date();
      const clockIn = new Date(rec.clockInTime);
      let breakMinutes = rec.totalBreakMinutes;
      const breaks = rec.breaks.map((b) => {
        if (!b.end) {
          const end = now.toISOString();
          breakMinutes +=
            (now.getTime() - new Date(b.start).getTime()) / 60000;
          return { ...b, end };
        }
        return b;
      });
      const totalMinutes =
        (now.getTime() - clockIn.getTime()) / 60000 - breakMinutes;
      const overtime = Math.max(0, totalMinutes - STANDARD_MINUTES_PER_DAY);
      const attendance = s.attendance.map((a) =>
        a === rec
          ? {
              ...a,
              clockOutTime: now.toISOString(),
              totalBreakMinutes: Math.round(breakMinutes),
              totalWorkedMinutes: Math.round(totalMinutes),
              overtimeMinutes: Math.round(overtime),
              breaks,
            }
          : a
      );
      // Convert overtime to replacement leave
      let newReplacementDay = false;
      const balances = s.balances.map((b) => {
        if (b.employeeId !== employeeId) return b;
        const bank = b.overtimeHoursBank + overtime / 60;
        const earned = Math.floor(bank / 8);
        if (earned > 0) newReplacementDay = true;
        return {
          ...b,
          overtimeHoursBank: bank - earned * 8,
          replacementBalance: b.replacementBalance + earned,
        };
      });
      const notifs: Notification[] = newReplacementDay
        ? [
            {
              id: 'n-' + uid(),
              recipientId: employeeId,
              type: 'REPLACEMENT_EARNED',
              title: "You've earned replacement leave!",
              body: 'Your recent overtime just converted into replacement leave days.',
              isRead: false,
              createdAt: new Date().toISOString(),
            },
            ...s.notifications,
          ]
        : s.notifications;
      return {
        attendance,
        balances,
        notifications: notifs,
        toasts: [
          {
            id: uid(),
            kind: 'success',
            title: 'Clocked out',
            body: `Total: ${Math.round(totalMinutes)}m worked.`,
          },
          ...s.toasts,
        ],
      };
    }),

  startBreak: (employeeId) =>
    set((s) => {
      const date = new Date().toISOString().slice(0, 10);
      const rec = s.attendance.find(
        (a) => a.employeeId === employeeId && a.date === date
      );
      if (!rec || !rec.clockInTime || rec.clockOutTime) return s;
      if (rec.breaks.some((b) => !b.end)) return s;
      return {
        attendance: s.attendance.map((a) =>
          a === rec
            ? { ...a, breaks: [...a.breaks, { start: new Date().toISOString() }] }
            : a
        ),
      };
    }),

  endBreak: (employeeId) =>
    set((s) => {
      const date = new Date().toISOString().slice(0, 10);
      const rec = s.attendance.find(
        (a) => a.employeeId === employeeId && a.date === date
      );
      if (!rec) return s;
      const now = new Date();
      let added = 0;
      const breaks = rec.breaks.map((b) => {
        if (!b.end) {
          added = (now.getTime() - new Date(b.start).getTime()) / 60000;
          return { ...b, end: now.toISOString() };
        }
        return b;
      });
      return {
        attendance: s.attendance.map((a) =>
          a === rec
            ? {
                ...a,
                breaks,
                totalBreakMinutes: a.totalBreakMinutes + Math.round(added),
              }
            : a
        ),
      };
    }),

  markNotificationRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    })),
  markAllRead: (userId) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.recipientId === userId ? { ...n, isRead: true } : n
      ),
    })),

  addToast: (t) =>
    set((s) => ({ toasts: [{ id: uid(), ...t }, ...s.toasts] })),
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  createHoliday: (h) =>
    set((s) => ({ holidays: [{ id: 'h-' + uid(), ...h }, ...s.holidays] })),
  updateHoliday: (id, patch) =>
    set((s) => ({
      holidays: s.holidays.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    })),
  deleteHoliday: (id) =>
    set((s) => ({ holidays: s.holidays.filter((h) => h.id !== id) })),
  sendHolidayNotice: (id) =>
    set((s) => {
      const now = new Date().toISOString();
      const h = s.holidays.find((x) => x.id === id);
      if (!h) return s;
      const staff = s.users.filter((u) => u.role !== 'SUPER_ADMIN');
      const notes: Notification[] = staff.map((u) => ({
        id: 'n-' + uid(),
        recipientId: u.id,
        type: 'HOLIDAY_NOTICE',
        title: `Upcoming holiday — ${h.name}`,
        body: `${h.name} is on ${h.date}. The office will be closed.`,
        isRead: false,
        createdAt: now,
      }));
      return {
        holidays: s.holidays.map((x) =>
          x.id === id ? { ...x, notificationSentAt: now } : x
        ),
        notifications: [...notes, ...s.notifications],
        toasts: [
          {
            id: uid(),
            kind: 'success',
            title: 'Holiday notice sent',
            body: `${staff.length} recipient${staff.length === 1 ? '' : 's'} notified.`,
          },
          ...s.toasts,
        ],
      };
    }),
}));

// Helper hooks
export function useCurrentUser(): User | null {
  return useStore((s) => {
    if (!s.currentUserId) return null;
    return s.users.find((u) => u.id === s.currentUserId) ?? null;
  });
}

// Types for consumer imports
export type { LeaveType, NotificationChannel };
