'use client';
import { useMemo } from 'react';
import type { AttendanceRecordData, LeaveRequestSummary } from '@/lib/hooks';

/**
 * Weekly attendance heatmap.
 *
 * Y-axis: this week's working days per `workDaysBitmask` (bit 0 = Sunday).
 * X-axis: hour blocks from `startHour` to `endHour` (default 09:00 -> 17:00,
 *   drawn with a start-of-block label above each cell in 12-hour AM/PM
 *   format, plus a trailing marker for the shift end at 5:00 PM).
 *
 * Cell colors:
 *   Green      - worked more than 30 minutes in that hour block
 *                (attendance overrides leave when the person did clock in)
 *   Yellow     - approved leave covering that hour block (half-day aware)
 *   Light gray - no work recorded in that hour (idle)
 *   Diagonal   - hour is still in the future
 */
export interface AttendanceHeatmapProps {
  records: AttendanceRecordData[];
  leaves: LeaveRequestSummary[];
  /** Bit 0 = Sun, bit 6 = Sat. Default = Sun-Thu (31, Bangladesh workweek). */
  workDaysBitmask?: number;
  startHour?: number;
  endHour?: number;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABEL_WIDTH = 72; // px, matches CSS grid template

/** Local-date ISO (yyyy-MM-dd) - never toISOString() which is UTC and off-by-one for BD. */
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Sunday-anchored start of the current week. */
function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** Minutes-of-day (0-1440) from an ISO datetime, honoring the browser's local TZ. */
function localMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** 12-hour AM/PM label for an hour of the day. */
function fmt12(h: number): string {
  const suffix = h < 12 ? 'AM' : 'PM';
  const hh = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${hh}:00 ${suffix}`;
}

export function AttendanceHeatmap({
  records,
  leaves,
  workDaysBitmask = 31,
  startHour = 9,
  endHour = 17,
}: AttendanceHeatmapProps) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const weekStart = startOfWeek(now);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h < endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  const rows = useMemo(() => {
    const out: { date: Date; iso: string; dow: number; isFuture: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const dow = day.getDay();
      const isWorkDay = (workDaysBitmask & (1 << dow)) !== 0;
      if (!isWorkDay) continue;
      // Compare dates by day-key so time-of-day doesn't accidentally mark today as future.
      const dayKey = toLocalIso(day);
      const todayKey = toLocalIso(now);
      out.push({ date: day, iso: dayKey, dow, isFuture: dayKey > todayKey });
    }
    return out;
  }, [weekStart, now, workDaysBitmask]);

  function cellState(iso: string, hour: number, dayInFuture: boolean): 'worked' | 'leave' | 'idle' | 'future' {
    const cellStart = hour * 60;
    const cellEnd = (hour + 1) * 60;

    // Future window - the hour hasn't started yet today.
    if (dayInFuture) return 'future';
    const isToday = iso === toLocalIso(now);
    if (isToday && cellStart >= nowMin) return 'future';

    // Attendance wins over leave: if the person actually clocked in,
    // show green wherever they worked, even if they also filed leave.
    const rec = records.find((r) => r.date === iso);
    if (rec?.clockInTime) {
      const inMin = localMinutes(rec.clockInTime);
      const outMin = rec.clockOutTime
        ? localMinutes(rec.clockOutTime)
        : isToday
          ? nowMin
          : cellEnd; // still-open session on a past day - cap at cell end so we don't over-paint

      const overlapStart = Math.max(cellStart, inMin);
      const overlapEnd = Math.min(cellEnd, outMin);
      let workedMin = Math.max(0, overlapEnd - overlapStart);

      // Subtract break minutes that overlap this hour block.
      for (const br of rec.breaks ?? []) {
        const bStart = localMinutes(br.start);
        const bEnd = br.end ? localMinutes(br.end) : (isToday ? nowMin : bStart);
        const bOverlapStart = Math.max(cellStart, bStart);
        const bOverlapEnd = Math.min(cellEnd, bEnd);
        workedMin -= Math.max(0, bOverlapEnd - bOverlapStart);
      }

      // Rule: mark the block green only when > 30 min of that hour was actually worked.
      if (workedMin > 30) return 'worked';
    }

    // Leave check - fallback when the person did NOT work this cell.
    const leave = leaves.find(
      (l) => l.status === 'APPROVED' && iso >= l.startDate && iso <= l.endDate,
    );
    if (leave) {
      const isSingle = leave.startDate === leave.endDate;
      if (leave.isHalfDay && isSingle) {
        if (leave.halfDaySlot === 'MORNING' && hour < 13) return 'leave';
        if (leave.halfDaySlot === 'AFTERNOON' && hour >= 13) return 'leave';
      } else if (leave.timeFrom && leave.timeTo && isSingle) {
        const [fh] = leave.timeFrom.split(':').map(Number);
        const [th] = leave.timeTo.split(':').map(Number);
        if (hour >= fh && hour < th) return 'leave';
      } else {
        return 'leave';
      }
    }

    return 'idle';
  }

  return (
    <div className="ahm">
      <div className="ahm-header">
        <div>
          <h3>Working-hour heatmap</h3>
          <p className="muted">
            When you were on the clock this week. A block turns green after more than
            30 minutes of that hour has been worked. Standard shift is 9:00 AM to 5:00 PM.
          </p>
        </div>
        <div className="ahm-legend">
          <span><i className="ahm-swatch ahm-worked" />Worked</span>
          <span><i className="ahm-swatch ahm-leave" />Leave</span>
          <span><i className="ahm-swatch ahm-idle" />Not clocked</span>
          <span><i className="ahm-swatch ahm-future" />Upcoming</span>
        </div>
      </div>

      {/* Hour labels sit at the START of each hour column, plus one trailing marker
          on the right for the shift end at 5:00 PM. */}
      <div
        className="ahm-hours-row"
        style={{ gridTemplateColumns: `${DAY_LABEL_WIDTH}px repeat(${hours.length}, 1fr)` }}
      >
        <div className="ahm-corner" />
        {hours.map((h) => (
          <div key={h} className="ahm-hour-label">{fmt12(h)}</div>
        ))}
        <div className="ahm-hour-label-end">{fmt12(endHour)}</div>
      </div>

      <div
        className="ahm-grid"
        style={{ gridTemplateColumns: `${DAY_LABEL_WIDTH}px repeat(${hours.length}, 1fr)` }}
      >
        {rows.map((r) => (
          <div key={r.iso} className="ahm-row" style={{ display: 'contents' }}>
            <div className="ahm-day-label">
              <div>{WEEKDAY_LABELS[r.dow]}</div>
              <div className="ahm-day-num">{r.date.getDate()}</div>
            </div>
            {hours.map((h) => {
              const state = cellState(r.iso, h, r.isFuture);
              return (
                <div
                  key={`${r.iso}-${h}`}
                  className={`ahm-cell ahm-${state}`}
                  title={`${WEEKDAY_LABELS[r.dow]} ${r.date.getDate()} · ${fmt12(h)} - ${fmt12(h + 1)} · ${
                    state === 'worked' ? 'Worked' : state === 'leave' ? 'On leave' : state === 'future' ? 'Upcoming' : 'Not clocked in'
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
