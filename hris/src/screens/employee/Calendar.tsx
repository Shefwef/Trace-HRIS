'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
} from 'date-fns';
import { useCurrentUser } from '@/lib/session';
import { useMyLeaves, useHolidays, useAttendanceHistory } from '@/lib/hooks';
import { Badge } from '../../components/ui/Badge';
import { cx, fmtDate } from '../../lib/utils';
import './Calendar.css';

export function CalendarPage() {
  const user = useCurrentUser();
  const [month, setMonth] = useState(() => new Date());
  const { data: requests = [] } = useMyLeaves();
  const { data: holidays = [] } = useHolidays(month.getFullYear());
  const { data: attendanceData } = useAttendanceHistory(month.getFullYear(), month.getMonth() + 1);
  const attendance = attendanceData?.records ?? [];

  const days = useMemo(() => {
    const first = startOfMonth(month);
    const last = endOfMonth(month);
    const gridStart = new Date(first);
    gridStart.setDate(gridStart.getDate() - first.getDay());
    const gridEnd = new Date(last);
    gridEnd.setDate(gridEnd.getDate() + (6 - last.getDay()));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  if (!user) return null;

  return (
    <div className="calpg">
      <div className="calpg-head">
        <div>
          <h1>Calendar</h1>
          <p className="muted">Your leaves, holidays and attendance for the month.</p>
        </div>
        <div className="calpg-nav">
          <button onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous"><ChevronLeft size={16} /></button>
          <div className="calpg-nav-title">{format(month, 'MMMM yyyy')}</div>
          <button onClick={() => setMonth(addMonths(month, 1))} aria-label="Next"><ChevronRight size={16} /></button>
        </div>
      </div>

      <motion.div
        className="calpg-grid"
        key={month.toISOString()}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="calpg-dow">
            <span className="calpg-dow-full">{d}</span>
            <span className="calpg-dow-short">{d[0]}</span>
          </div>
        ))}
        {days.map((d) => {
          // Local-date ISO so leave cells align to the day the user sees,
          // not the day UTC happens to hold at midnight local time.
          const iso = format(d, 'yyyy-MM-dd');
          const weekday = d.getDay();
          // Bangladesh weekend: Friday (5) + Saturday (6).
          const isWeekend = weekday === 5 || weekday === 6;
          const holiday = holidays.find((h) => h.date === iso);
          const leave = requests.find(
            (r) => r.status === 'APPROVED' && iso >= r.startDate && iso <= r.endDate
          );
          const att = attendance.find((a) => a.date === iso);
          const statusClass =
            holiday ? 'calpg-cell-holiday' :
            leave ? 'calpg-cell-leave' :
            att?.status === 'HALF_DAY' ? 'calpg-cell-halfday' :
            att?.status === 'PRESENT' ? 'calpg-cell-present' :
            att?.status === 'ABSENT' ? 'calpg-cell-absent' :
            isWeekend ? 'calpg-cell-weekend-day' :
            '';
          return (
            <div
              key={iso}
              className={cx(
                'calpg-cell',
                statusClass,
                !isSameMonth(d, month) && 'calpg-cell-out',
                isToday(d) && 'calpg-cell-today'
              )}
            >
              <div className="calpg-cell-head">
                <span>{d.getDate()}</span>
              </div>
              <div className="calpg-cell-body">
                {holiday && <Badge variant="holiday">{holiday.name}</Badge>}
                {leave && !holiday && <Badge variant="casual">{leave.leaveType.toLowerCase()}</Badge>}
                {isWeekend && !holiday && !leave && !att && <span className="calpg-cell-weekend">Weekend</span>}
              </div>
            </div>
          );
        })}
      </motion.div>

      <div className="calpg-legend">
        <span><i className="calpg-legend-present" />Present</span>
        <span><i className="calpg-legend-leave" />Leave</span>
        <span><i className="calpg-legend-holiday" />Public holiday</span>
        <span><i className="calpg-legend-halfday" />Half-day</span>
        <span><i className="calpg-legend-weekend" />Weekend</span>
      </div>

      <div className="card calpg-upcoming">
        <h3>Upcoming</h3>
        <ul>
          {holidays
            .filter((h) => new Date(h.date) >= new Date())
            .slice(0, 5)
            .map((h) => (
              <li key={h.id}>
                <Badge variant="holiday">Holiday</Badge>
                <strong>{h.name}</strong>
                <span className="muted">{fmtDate(h.date, 'EEE, d MMM yyyy')}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
