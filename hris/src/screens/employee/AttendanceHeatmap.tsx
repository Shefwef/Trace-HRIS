'use client';
import { useMemo } from 'react';
import type { AttendanceRecordData, LeaveRequestSummary } from '@/lib/hooks';

/**
 * Weekly attendance heatmap.
 *
 * Y-axis: five weekdays of the current week (Sunday…Thursday in
 *   Bangladesh; adapts by iterating the current week and dropping
 *   weekends per `workDaysBitmask` if provided).
 * X-axis: hour blocks from `startHour` to `endHour` (default 09→17).
 *
 * Cell colors:
 *   Green      — worked during that hour (clock-in ≤ hour < clock-out)
 *   Yellow     — approved leave covering that hour (half-day aware)
 *   Light gray — no data / clocked out / future
 *   White-ish  — day is not a working day
 */
export interface AttendanceHeatmapProps {
  records: AttendanceRecordData[];
  leaves: LeaveRequestSummary[];
  /** Bit 0 = Sun, bit 6 = Sat. Defaults to Mon–Fri (62) if missing. */
  workDaysBitmask?: number;
  startHour?: number;
  endHour?: number;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sunday-anchored start of the current week. */
function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** Fractional hour, e.g. 14:30 → 14.5. */
function hoursOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

export function AttendanceHeatmap({
  records,
  leaves,
  workDaysBitmask = 62,
  startHour = 9,
  endHour = 17,
}: AttendanceHeatmapProps) {
  const now = new Date();
  const nowHour = hoursOf(now.toISOString());
  const weekStart = startOfWeek(now);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h < endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  const rows = useMemo(() => {
    const out: { date: Date; iso: string; dow: number; isWorkDay: boolean; isFuture: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const dow = day.getDay(); // 0 = Sun
      const isWorkDay = (workDaysBitmask & (1 << dow)) !== 0;
      if (!isWorkDay) continue;
      out.push({
        date: day,
        iso: toIsoDate(day),
        dow,
        isWorkDay,
        isFuture: day > now,
      });
    }
    return out;
  }, [weekStart, now, workDaysBitmask]);

  function cellState(iso: string, hour: number, dayInFuture: boolean): 'worked' | 'leave' | 'idle' | 'future' {
    // Future cells always render as idle-future (never worked or leave).
    const cellDate = new Date(iso + 'T00:00:00');
    cellDate.setHours(hour, 0, 0, 0);
    if (cellDate > now || dayInFuture) return 'future';

    // Leave check first — leaves override attendance for their scope.
    const leave = leaves.find(
      (l) => l.status === 'APPROVED' && iso >= l.startDate && iso <= l.endDate,
    );
    if (leave) {
      const isSingle = leave.startDate === leave.endDate;
      if (leave.isHalfDay && isSingle) {
        // Morning slot = hours < 13; afternoon = hours >= 13.
        if (leave.halfDaySlot === 'MORNING' && hour < 13) return 'leave';
        if (leave.halfDaySlot === 'AFTERNOON' && hour >= 13) return 'leave';
      } else if (leave.timeFrom && leave.timeTo && isSingle) {
        const [fh] = leave.timeFrom.split(':').map(Number);
        const [th] = leave.timeTo.split(':').map(Number);
        if (hour >= fh && hour < th) return 'leave';
      } else {
        // Full-day leave (or multi-day range) → whole day yellow.
        return 'leave';
      }
    }

    // Attendance check — inclusive of clock-in hour, exclusive of clock-out hour.
    const rec = records.find((r) => r.date === iso);
    if (rec?.clockInTime) {
      const inHr = hoursOf(rec.clockInTime);
      const outHr = rec.clockOutTime ? hoursOf(rec.clockOutTime) : nowHour;
      if (hour + 1 > inHr && hour < outHr) return 'worked';
    }

    return 'idle';
  }

  return (
    <div className="ahm">
      <div className="ahm-header">
        <div>
          <h3>Working-hour heatmap</h3>
          <p className="muted">
            When you were on the clock this week. Each block is one hour of your standard {startHour}:00–{endHour}:00 workday.
          </p>
        </div>
        <div className="ahm-legend">
          <span><i className="ahm-swatch ahm-worked" />Worked</span>
          <span><i className="ahm-swatch ahm-leave" />Leave</span>
          <span><i className="ahm-swatch ahm-idle" />Not clocked</span>
          <span><i className="ahm-swatch ahm-future" />Upcoming</span>
        </div>
      </div>

      <div
        className="ahm-grid"
        style={{ gridTemplateColumns: `72px repeat(${hours.length}, 1fr)` }}
      >
        <div className="ahm-corner" />
        {hours.map((h) => (
          <div key={h} className="ahm-hour-label">{h}:00</div>
        ))}
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
                  title={`${WEEKDAY_LABELS[r.dow]} ${r.date.getDate()} · ${h}:00 · ${
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
