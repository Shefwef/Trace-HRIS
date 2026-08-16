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
import { useCurrentUser, useStore } from '../../lib/store';
import { Badge } from '../../components/ui/Badge';
import { cx, fmtDate } from '../../lib/utils';
import './Calendar.css';

export function CalendarPage() {
  const user = useCurrentUser();
  const [month, setMonth] = useState(new Date(2026, 7, 1));
  const requests = useStore((s) => s.requests);
  const holidays = useStore((s) => s.holidays);
  const attendance = useStore((s) => s.attendance);

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
          <div key={d} className="calpg-dow">{d}</div>
        ))}
        {days.map((d) => {
          const iso = d.toISOString().slice(0, 10);
          const weekday = d.getDay();
          const isWeekend = weekday === 0 || weekday === 6;
          const holiday = holidays.find((h) => h.date === iso);
          const leave = requests.find(
            (r) => r.employeeId === user.id && r.status === 'APPROVED' &&
                   iso >= r.startDate && iso <= r.endDate
          );
          const att = attendance.find((a) => a.employeeId === user.id && a.date === iso);
          return (
            <div
              key={iso}
              className={cx(
                'calpg-cell',
                !isSameMonth(d, month) && 'calpg-cell-out',
                isToday(d) && 'calpg-cell-today'
              )}
            >
              <div className="calpg-cell-head">
                <span>{d.getDate()}</span>
                {holiday && <span className="calpg-cell-dot" style={{ background: 'var(--color-leave-holiday)' }} />}
                {leave && !holiday && <span className="calpg-cell-dot" style={{ background: 'var(--color-leave-casual)' }} />}
                {att?.status === 'PRESENT' && !holiday && !leave && <span className="calpg-cell-dot" style={{ background: 'var(--color-success)' }} />}
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
        <span><i style={{ background: 'var(--color-success)' }} />Present</span>
        <span><i style={{ background: 'var(--color-leave-casual)' }} />Leave</span>
        <span><i style={{ background: 'var(--color-leave-holiday)' }} />Public holiday</span>
        <span><i style={{ background: 'var(--color-bg-muted)' }} />Weekend</span>
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
