/**
 * Business rules for leave duration and balance math.
 */
import type { CreateLeaveInput } from './validation';

/**
 * Compute the leave duration (in days) for a request. Weekends (Sat/Sun) are
 * excluded from multi-day ranges.
 *
 * - Full-day range: number of weekdays inclusive.
 * - Half-day (single day): 0.5.
 * - Time-range (single day, timeFrom–timeTo): fraction of an 8-hour day.
 */
export function computeDurationDays(input: CreateLeaveInput): number {
  const start = new Date(input.startDate + 'T00:00:00Z');
  const end = new Date(input.endDate + 'T00:00:00Z');

  if (input.isHalfDay) return 0.5;

  if (input.timeFrom && input.timeTo) {
    const [fh, fm] = input.timeFrom.split(':').map(Number);
    const [th, tm] = input.timeTo.split(':').map(Number);
    const minutes = (th * 60 + tm) - (fh * 60 + fm);
    if (minutes <= 0) return 0;
    // Standard 8-hour workday = 480 minutes. Round to 0.5 for readability.
    const days = minutes / 480;
    return Math.round(days * 2) / 2;
  }

  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay(); // 0 = Sun, 6 = Sat
    // Bangladesh work week is Sun-Thu; weekends are Fri (5) and Sat (6).
    if (dow !== 5 && dow !== 6) days += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/**
 * Compute the total duration in days from an approver's allocation.
 * Each entry: FULL = 1, HALF_MORNING = 0.5, HALF_AFTERNOON = 0.5.
 */
export type AllocationSlot = 'FULL' | 'HALF_MORNING' | 'HALF_AFTERNOON';
export interface AllocationEntry {
  date: string; // YYYY-MM-DD
  slot: AllocationSlot;
}
export function slotDays(slot: AllocationSlot): number {
  return slot === 'FULL' ? 1 : 0.5;
}
export function computeDurationFromAllocation(entries: AllocationEntry[]): number {
  return entries.reduce((sum, e) => sum + slotDays(e.slot), 0);
}
export function slotLabel(slot: AllocationSlot): string {
  return slot === 'FULL'
    ? 'Full'
    : slot === 'HALF_MORNING'
    ? 'Morning half'
    : 'Afternoon half';
}
export function slotShort(slot: AllocationSlot): string {
  return slot === 'FULL' ? 'Full' : slot === 'HALF_MORNING' ? '½ AM' : '½ PM';
}

/** Given the fields on a leave request, produce a default per-day allocation. */
export function defaultAllocationFor(input: {
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  halfDaySlot?: 'MORNING' | 'AFTERNOON' | null;
  timeFrom?: string | null;
  timeTo?: string | null;
}): AllocationEntry[] {
  const start = new Date(input.startDate + 'T00:00:00Z');
  const end = new Date(input.endDate + 'T00:00:00Z');
  const entries: AllocationEntry[] = [];

  // Time-range partial (single-day, treated as half day toward the closer slot)
  if (input.timeFrom && input.timeTo && input.startDate === input.endDate) {
    const [fh] = input.timeFrom.split(':').map(Number);
    const slot: AllocationSlot = fh < 12 ? 'HALF_MORNING' : 'HALF_AFTERNOON';
    entries.push({ date: input.startDate, slot });
    return entries;
  }

  if (input.isHalfDay) {
    const slot: AllocationSlot =
      input.halfDaySlot === 'AFTERNOON' ? 'HALF_AFTERNOON' : 'HALF_MORNING';
    entries.push({ date: input.startDate, slot });
    return entries;
  }

  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      entries.push({ date: cur.toISOString().slice(0, 10), slot: 'FULL' });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return entries;
}

export function extraWorkCredit(
  workType: 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON'
): number {
  return workType === 'FULL_DAY' ? 1 : 0.5;
}

export function leaveTypeLabel(t: 'CASUAL' | 'SICK' | 'REPLACEMENT'): string {
  return t === 'CASUAL' ? 'Casual Leave' : t === 'SICK' ? 'Sick Leave' : 'Replacement Leave';
}

export function extraWorkTypeLabel(
  t: 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON'
): string {
  if (t === 'FULL_DAY') return 'Full day (9 AM – 5 PM)';
  if (t === 'HALF_DAY_MORNING') return 'Half day, morning (9 AM – 1 PM)';
  return 'Half day, afternoon (1 PM – 5 PM)';
}

/** Format a leave period for humans. */
export function formatLeavePeriod(
  startDate: string,
  endDate: string,
  isHalfDay: boolean,
  halfDaySlot: 'MORNING' | 'AFTERNOON' | null | undefined,
  timeFrom: string | null | undefined,
  timeTo: string | null | undefined
): string {
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00Z').toLocaleDateString('en', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  if (timeFrom && timeTo) return `${fmt(startDate)} · ${timeFrom}–${timeTo}`;
  if (isHalfDay) return `${fmt(startDate)} · ${halfDaySlot === 'MORNING' ? 'morning' : 'afternoon'} half`;
  if (startDate === endDate) return fmt(startDate);
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}
