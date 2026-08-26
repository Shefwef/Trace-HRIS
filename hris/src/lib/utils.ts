import { differenceInBusinessDays, format, parseISO } from 'date-fns';
import { localDayKey } from './workday';

export function cx(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function fmtDate(iso: string, fmt = 'd MMM yyyy'): string {
  return format(parseISO(iso), fmt);
}

export function fmtDateShort(iso: string): string {
  return format(parseISO(iso), 'd MMM');
}

export function fmtTime(iso: string): string {
  return format(parseISO(iso), 'h:mm a');
}

export function fmtRelative(iso: string): string {
  const now = new Date();
  const then = parseISO(iso);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return format(then, 'd MMM yyyy');
}

export function workingDaysBetween(startISO: string, endISO: string): number {
  return differenceInBusinessDays(parseISO(endISO), parseISO(startISO)) + 1;
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function leaveTypeLabel(t: 'CASUAL' | 'SICK' | 'REPLACEMENT'): string {
  switch (t) {
    case 'CASUAL': return 'Casual Leave';
    case 'SICK': return 'Sick Leave';
    case 'REPLACEMENT': return 'Replacement Leave';
  }
}

export function leaveTypeShort(t: 'CASUAL' | 'SICK' | 'REPLACEMENT'): string {
  return t === 'CASUAL' ? 'CL' : t === 'SICK' ? 'SL' : 'RL';
}

export function leaveTypeColor(t: 'CASUAL' | 'SICK' | 'REPLACEMENT'): string {
  return t === 'CASUAL'
    ? 'var(--color-leave-casual)'
    : t === 'SICK'
    ? 'var(--color-leave-sick)'
    : 'var(--color-leave-replacement)';
}

export function leaveTypeBgColor(t: 'CASUAL' | 'SICK' | 'REPLACEMENT'): string {
  return t === 'CASUAL'
    ? 'var(--color-leave-casual-light)'
    : t === 'SICK'
    ? 'var(--color-leave-sick-light)'
    : 'var(--color-leave-replacement-light)';
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Today as `yyyy-MM-dd` in the office timezone. Not `toISOString().slice(0, 10)`
 * — that is the UTC day, which is yesterday for anyone in Dhaka before 06:00.
 */
export function todayISO(): string {
  return localDayKey();
}
