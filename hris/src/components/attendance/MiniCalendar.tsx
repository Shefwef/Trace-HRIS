'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCurrentUser } from '@/lib/session';
import { useMyLeaves, useHolidays, useAttendanceHistory } from '@/lib/hooks';
import { cx } from '../../lib/utils';
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, isToday, parseISO } from 'date-fns';
import './MiniCalendar.css';

type DayInfo = {
  date: Date;
  status?: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'HALF_DAY' | 'WEEKEND' | 'FUTURE';
  holidayName?: string;
};

function statusColor(s?: DayInfo['status']): string {
  switch (s) {
    case 'PRESENT': return 'var(--color-success)';
    case 'ABSENT': return 'var(--color-danger)';
    case 'LEAVE': return 'var(--color-leave-casual)';
    case 'HOLIDAY': return 'var(--color-leave-holiday)';
    case 'HALF_DAY': return 'var(--color-warning)';
    case 'WEEKEND': return 'var(--color-bg-muted)';
    default: return 'transparent';
  }
}

export function MiniCalendar() {
  const user = useCurrentUser();
  const [month, setMonth] = useState(() => new Date());
  const { data: requests = [] } = useMyLeaves();
  const { data: holidays = [] } = useHolidays(month.getFullYear());
  const { data: attData } = useAttendanceHistory(month.getFullYear(), month.getMonth() + 1);
  const attendance = attData?.records ?? [];

  if (!user) return null;

  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - first.getDay());
  const gridEnd = new Date(last);
  gridEnd.setDate(gridEnd.getDate() + (6 - last.getDay()));

  const days: DayInfo[] = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((d) => {
    const iso = d.toISOString().slice(0, 10);
    const weekday = d.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const holiday = holidays.find((h) => h.date === iso);
    const approvedLeave = requests.find(
      (r) => r.status === 'APPROVED' && iso >= r.startDate && iso <= r.endDate
    );
    const att = attendance.find((a) => a.date === iso);
    let status: DayInfo['status'];
    if (holiday) status = 'HOLIDAY';
    else if (approvedLeave) status = 'LEAVE';
    else if (isWeekend) status = 'WEEKEND';
    else if (att?.status === 'PRESENT') status = 'PRESENT';
    else if (att?.status === 'HALF_DAY') status = 'HALF_DAY';
    else if (att?.status === 'ABSENT') status = 'ABSENT';
    else status = 'FUTURE';
    return { date: d, status, holidayName: holiday?.name };
  });

  return (
    <div className="mcal">
      <div className="mcal-header">
        <div className="mcal-title">{format(month, 'MMMM yyyy')}</div>
        <div className="mcal-nav">
          <button onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <motion.div
        key={month.toISOString()}
        className="mcal-grid"
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
      >
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div className="mcal-dow" key={`${d}-${i}`}>{d}</div>
        ))}
        {days.map((d) => (
          <div
            key={d.date.toISOString()}
            className={cx(
              'mcal-cell',
              !isSameMonth(d.date, month) && 'mcal-cell-out',
              isToday(d.date) && 'mcal-cell-today'
            )}
            title={
              d.holidayName
                ? `Holiday: ${d.holidayName}`
                : d.status === 'LEAVE'
                ? 'On leave'
                : d.status === 'PRESENT'
                ? 'Present'
                : ''
            }
          >
            <span className="mcal-cell-num">{d.date.getDate()}</span>
            {d.status && d.status !== 'FUTURE' && d.status !== 'WEEKEND' && (
              <span className="mcal-cell-dot" style={{ background: statusColor(d.status) }} />
            )}
          </div>
        ))}
      </motion.div>
      <div className="mcal-legend">
        <span><i style={{ background: 'var(--color-success)' }} />Present</span>
        <span><i style={{ background: 'var(--color-leave-casual)' }} />Leave</span>
        <span><i style={{ background: 'var(--color-leave-holiday)' }} />Holiday</span>
        <span><i style={{ background: 'var(--color-warning)' }} />Half-day</span>
      </div>
    </div>
  );
}
export { parseISO, isSameDay };
