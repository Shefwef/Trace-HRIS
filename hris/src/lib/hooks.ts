'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateLeaveInput, CreateExtraWorkInput } from './validation';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch {}
    const msg =
      (typeof body === 'object' && body && 'message' in body && typeof (body as { message?: unknown }).message === 'string')
        ? (body as { message: string }).message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────

export interface Balance {
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
}

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LeaveType = 'CASUAL' | 'SICK' | 'REPLACEMENT';

export interface LeaveRequestSummary {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  halfDaySlot: 'MORNING' | 'AFTERNOON' | null;
  timeFrom: string | null;
  timeTo: string | null;
  durationDays: number;
  reason: string;
  description: string | null;
  attachmentUrl: string | null;
  channels: ('EMAIL' | 'IN_APP')[];
  customMessage: string | null;
  status: LeaveStatus;
  adminNote: string | null;
  approvedAllocation:
    | { date: string; slot: 'FULL' | 'HALF_MORNING' | 'HALF_AFTERNOON' }[]
    | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string; fullName: string; email: string; role: string;
    department: string | null; designation: string | null; avatarUrl: string | null;
  };
  reviewer?: { id: string; fullName: string } | null;
}

export interface LeaveDetail extends LeaveRequestSummary {
  balancePreview: {
    casualLeft: number;
    sickLeft: number;
    replacementLeft: number;
  } | null;
}

export interface ExtraWorkSummary {
  id: string;
  employeeId: string;
  workDate: string;
  workType: 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON';
  reason: string;
  description: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  employee?: { id: string; fullName: string; email: string; role: string; department: string | null; avatarUrl: string | null };
  reviewer?: { id: string; fullName: string } | null;
}

export interface UserSummary {
  id: string; fullName: string; email: string; role: string;
  department: string | null; designation: string | null;
  employeeIdCode: string | null; avatarUrl: string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string; role: string } | null;
}
export interface AuditLogResponse {
  total: number;
  limit: number;
  actions: string[];
  items: AuditLogItem[];
}

// ─── Queries ─────────────────────────────────────────────

export function useBalance() {
  return useQuery({
    queryKey: ['balance'],
    queryFn: () => api<Balance>('/api/leaves/balance'),
  });
}

export function useMyLeaves() {
  return useQuery({
    queryKey: ['leaves', 'mine'],
    queryFn: () => api<LeaveRequestSummary[]>('/api/leaves/requests?scope=mine'),
  });
}

export function useAllLeaves() {
  return useQuery({
    queryKey: ['leaves', 'all'],
    queryFn: () => api<LeaveRequestSummary[]>('/api/leaves/requests?scope=all'),
  });
}

export function useLeaveDetail(id: string | null) {
  return useQuery({
    queryKey: ['leaves', 'detail', id],
    queryFn: () => api<LeaveDetail>(`/api/leaves/requests/${id}`),
    enabled: !!id,
  });
}

export function useMyExtraWork() {
  return useQuery({
    queryKey: ['extra-work', 'mine'],
    queryFn: () => api<ExtraWorkSummary[]>('/api/extra-work?scope=mine'),
  });
}

export function useAllExtraWork() {
  return useQuery({
    queryKey: ['extra-work', 'all'],
    queryFn: () => api<ExtraWorkSummary[]>('/api/extra-work?scope=all'),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api<UserSummary[]>('/api/users'),
    staleTime: 5 * 60_000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ unread: number; items: NotificationItem[] }>('/api/notifications'),
    refetchInterval: 30_000,
  });
}

export function useAuditLog(filters: { action?: string; actorId?: string; targetType?: string; since?: string } = {}) {
  const q = new URLSearchParams();
  if (filters.action) q.set('action', filters.action);
  if (filters.actorId) q.set('actorId', filters.actorId);
  if (filters.targetType) q.set('targetType', filters.targetType);
  if (filters.since) q.set('since', filters.since);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return useQuery({
    queryKey: ['audit-log', filters],
    queryFn: () => api<AuditLogResponse>(`/api/audit-log${qs}`),
  });
}

export interface SystemStatus {
  ok: boolean;
  checkedAt: string;
  db: {
    ok: boolean;
    latencyMs: number;
    error: string | null;
    counts: Record<string, number> | null;
  };
  env: {
    node: string;
    nextPublicAppUrl: string | null;
    clerkConfigured: boolean;
    databaseUrlHost: string | null;
    resendConfigured: boolean;
    nodeEnv: string | undefined;
  };
}
export function useSystemStatus() {
  return useQuery({
    queryKey: ['system-status'],
    queryFn: () => api<SystemStatus>('/api/system'),
    refetchInterval: 60_000,
  });
}

// ─── Mutations ───────────────────────────────────────────

export function useSubmitLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeaveInput) =>
      api<LeaveRequestSummary>('/api/leaves/requests', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
    },
  });
}

export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/leaves/requests/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
    },
  });
}

export interface ApproveLeavePayload {
  id: string;
  note?: string;
  allocation?: Array<{ date: string; slot: 'FULL' | 'HALF_MORNING' | 'HALF_AFTERNOON' }>;
}
export function useApproveLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note, allocation }: ApproveLeavePayload) =>
      api(`/api/leaves/requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note, allocation }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useRejectLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api(`/api/leaves/requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useSubmitExtraWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExtraWorkInput) =>
      api<ExtraWorkSummary>('/api/extra-work', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extra-work'] });
    },
  });
}

export function useApproveExtraWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api(`/api/extra-work/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extra-work'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
    },
  });
}

export function useRejectExtraWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api(`/api/extra-work/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extra-work'] });
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ─── Attendance ─────────────────────────────────────────

export interface AttendanceBreak {
  id: string;
  start: string;
  end: string | null;
  durationMinutes: number | null;
}

export interface AttendanceRecordData {
  id: string;
  date: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
  overtimeMinutes: number;
  status: string;
  source: string;
  notes: string | null;
  breaks: AttendanceBreak[];
}

export interface TodayResponse {
  date: string;
  record: AttendanceRecordData | null;
  isWeekend: boolean;
}

export function useToday() {
  return useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api<TodayResponse>('/api/attendance/today'),
    refetchInterval: 60_000,
  });
}

export function useAttendanceHistory(year?: number, month?: number) {
  const q = new URLSearchParams();
  if (year) q.set('year', String(year));
  if (month) q.set('month', String(month));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return useQuery({
    queryKey: ['attendance', 'history', year, month],
    queryFn: () =>
      api<{ year: number; month: number; records: AttendanceRecordData[] }>(
        `/api/attendance/history${qs}`
      ),
  });
}

function invalidateAttendance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['attendance'] });
  qc.invalidateQueries({ queryKey: ['balance'] });
}

const TODAY_KEY = ['attendance', 'today'] as const;

/**
 * Optimistic clock-in — flips the UI to "clocked in" the instant the button
 * is clicked, then reconciles with the server in the background. If the
 * server rejects (e.g. already clocked in from another device), we roll back.
 */
export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/attendance/clock-in', { method: 'POST' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: TODAY_KEY });
      const prev = qc.getQueryData<TodayResponse>(TODAY_KEY);
      const now = new Date().toISOString();
      qc.setQueryData<TodayResponse>(TODAY_KEY, (old) => ({
        date: old?.date ?? new Date().toISOString().slice(0, 10),
        isWeekend: old?.isWeekend ?? false,
        record:
          old?.record != null
            ? { ...old.record, clockInTime: now, status: 'PRESENT' }
            : {
                id: 'optimistic',
                date: new Date().toISOString().slice(0, 10),
                clockInTime: now,
                clockOutTime: null,
                totalWorkedMinutes: 0,
                totalBreakMinutes: 0,
                overtimeMinutes: 0,
                status: 'PRESENT',
                source: 'MANUAL',
                notes: null,
                breaks: [],
              },
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(TODAY_KEY, ctx.prev);
    },
    onSettled: () => invalidateAttendance(qc),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/attendance/clock-out', { method: 'POST' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: TODAY_KEY });
      const prev = qc.getQueryData<TodayResponse>(TODAY_KEY);
      const now = new Date().toISOString();
      qc.setQueryData<TodayResponse>(TODAY_KEY, (old) => {
        if (!old?.record) return old;
        return { ...old, record: { ...old.record, clockOutTime: now } };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(TODAY_KEY, ctx.prev);
    },
    onSettled: () => invalidateAttendance(qc),
  });
}

export function useStartBreak() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/attendance/break/start', { method: 'POST' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: TODAY_KEY });
      const prev = qc.getQueryData<TodayResponse>(TODAY_KEY);
      const now = new Date().toISOString();
      qc.setQueryData<TodayResponse>(TODAY_KEY, (old) => {
        if (!old?.record) return old;
        return {
          ...old,
          record: {
            ...old.record,
            breaks: [
              ...old.record.breaks,
              { id: 'optimistic', start: now, end: null, durationMinutes: null },
            ],
          },
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(TODAY_KEY, ctx.prev);
    },
    onSettled: () => invalidateAttendance(qc),
  });
}

export function useEndBreak() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/attendance/break/end', { method: 'POST' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: TODAY_KEY });
      const prev = qc.getQueryData<TodayResponse>(TODAY_KEY);
      const now = new Date().toISOString();
      qc.setQueryData<TodayResponse>(TODAY_KEY, (old) => {
        if (!old?.record) return old;
        return {
          ...old,
          record: {
            ...old.record,
            breaks: old.record.breaks.map((b) =>
              !b.end
                ? {
                    ...b,
                    end: now,
                    durationMinutes: Math.round(
                      (new Date(now).getTime() - new Date(b.start).getTime()) / 60000,
                    ),
                  }
                : b,
            ),
          },
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(TODAY_KEY, ctx.prev);
    },
    onSettled: () => invalidateAttendance(qc),
  });
}

// ─── Holidays ─────────────────────────────────────────

export interface HolidayItem {
  id: string;
  name: string;
  date: string;
  isRecurring: boolean;
  description: string | null;
  notificationScheduled: boolean;
  notificationSendAt: string | null;
  recipients: 'ALL' | 'HR_ONLY' | 'STAFF_ONLY' | 'CUSTOM';
  customRecipientIds: string[];
  notificationSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string } | null;
}

export interface CreateHolidayPayload {
  name: string;
  date: string;
  isRecurring: boolean;
  description?: string;
  recipients: 'ALL' | 'HR_ONLY' | 'STAFF_ONLY' | 'CUSTOM';
  customRecipientIds?: string[];
}

export function useHolidays(year?: number) {
  const qs = year ? `?year=${year}` : '';
  return useQuery({
    queryKey: ['holidays', year ?? 'current'],
    queryFn: () => api<HolidayItem[]>(`/api/holidays${qs}`),
    staleTime: 5 * 60_000,
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHolidayPayload) =>
      api<HolidayItem>('/api/holidays', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
  });
}

export function useUpdateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CreateHolidayPayload> }) =>
      api<HolidayItem>(`/api/holidays/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/holidays/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
  });
}

// ─── Settings ───────────────────────────────────────

export interface SystemSettings {
  senderEmail: string;
  senderName: string;
  fromEmail: string;
  qaRedirectEmail: string | null;
  standardHoursPerDay: number;
  workStartTime: string;
  workEndTime: string;
  workDaysBitmask: number;
  overtimeThresholdMinutes: number;
  updatedAt: string;
}
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api<SystemSettings>('/api/settings'),
    staleTime: 60_000,
  });
}
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SystemSettings>) =>
      api<SystemSettings>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

// ─── Users (admin) ─────────────────────────────────

export interface InviteEmployeePayload {
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'HR' | 'EMPLOYEE';
  department: string;
  designation: string;
  employeeIdCode: string;
  cycleStartMonth: number;
  password?: string;
}
export function useInviteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteEmployeePayload) =>
      api<{ ok: true; id: string; email: string; initialPassword: string }>(
        '/api/users/invite',
        { method: 'POST', body: JSON.stringify(input) }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export interface UpdateEmployeePayload {
  fullName?: string;
  role?: 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE';
  department?: string;
  designation?: string;
  employeeIdCode?: string;
  isActive?: boolean;
}
export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateEmployeePayload }) =>
      api(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useSendHolidayNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true; recipients: number }>(`/api/holidays/${id}/send-notice`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holidays'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
