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

function statusClass(s?: DayInfo['status']): string {
  switch (s) {
    case 'PRESENT': return 'mcal-cell-present';
    case 'ABSENT': return 'mcal-cell-absent';
    case 'LEAVE': return 'mcal-cell-leave';
    case 'HOLIDAY': return 'mcal-cell-holiday';
    case 'HALF_DAY': return 'mcal-cell-halfday';
    default: return '';
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
    // Use local date components (not toISOString - that shifts by TZ offset
    // and causes calendar cells to align to UTC dates instead of the local
    // ones the user sees, showing leaves on the wrong day.)
    const iso = format(d, 'yyyy-MM-dd');
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
              statusClass(d.status),
              !isSameMonth(d.date, month) && 'mcal-cell-out',
              isToday(d.date) && 'mcal-cell-today'
            )}
            title={
              d.holidayName
                ? `Holiday: ${d.holidayName}`
                : d.status === 'LEAVE'
                ? 'On leave'
                : d.status === 'HALF_DAY'
                ? 'Half day'
                : d.status === 'PRESENT'
                ? 'Present'
                : d.status === 'ABSENT'
                ? 'Absent'
                : ''
            }
          >
            <span className="mcal-cell-num">{d.date.getDate()}</span>
          </div>
        ))}
      </motion.div>
      <div className="mcal-legend">
        <span><i className="mcal-legend-present" />Present</span>
        <span><i className="mcal-legend-leave" />Leave</span>
        <span><i className="mcal-legend-holiday" />Holiday</span>
        <span><i className="mcal-legend-halfday" />Half-day</span>
      </div>
    </div>
  );
}
export { parseISO, isSameDay };
