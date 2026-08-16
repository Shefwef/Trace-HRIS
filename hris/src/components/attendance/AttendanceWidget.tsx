import { useEffect, useState } from 'react';
import { Play, Coffee, Square, Timer } from 'lucide-react';
import { useCurrentUser, useStore } from '../../lib/store';
import { Button } from '../ui/Button';
import { fmtDuration } from '../../lib/utils';
import './AttendanceWidget.css';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function fmtSeconds(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function AttendanceWidget() {
  const user = useCurrentUser();
  const [tick, setTick] = useState(0);
  const clockIn = useStore((s) => s.clockIn);
  const clockOut = useStore((s) => s.clockOut);
  const startBreak = useStore((s) => s.startBreak);
  const endBreak = useStore((s) => s.endBreak);
  const record = useStore((s) => {
    if (!user) return undefined;
    const today = new Date().toISOString().slice(0, 10);
    return s.attendance.find((a) => a.employeeId === user.id && a.date === today);
  });

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  if (!user) return null;

  const now = Date.now();
  const activeBreak = record?.breaks.find((b) => !b.end);
  const isClockedIn = !!(record?.clockInTime && !record?.clockOutTime);
  const isClockedOut = !!record?.clockOutTime;
  const isWeekend = [0, 6].includes(new Date().getDay());

  let workedMs = 0;
  if (record?.clockInTime) {
    const clockInTime = new Date(record.clockInTime).getTime();
    const end = record.clockOutTime ? new Date(record.clockOutTime).getTime() : now;
    workedMs = end - clockInTime;
    for (const b of record.breaks) {
      const bStart = new Date(b.start).getTime();
      const bEnd = b.end ? new Date(b.end).getTime() : now;
      workedMs -= bEnd - bStart;
    }
  }
  const breakMs = activeBreak
    ? now - new Date(activeBreak.start).getTime()
    : 0;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="atw">
      <div className="atw-top">
        <div className="atw-date">
          <Timer size={14} /> Today: {todayLabel}
        </div>
        {isClockedIn && (
          <div className="atw-status">
            <span className="atw-dot" />
            {activeBreak ? 'On break' : 'Working'}
          </div>
        )}
        {isClockedOut && <div className="atw-status atw-status-done">Session complete</div>}
        {!record && !isWeekend && <div className="atw-status atw-status-idle">Not clocked in</div>}
        {isWeekend && <div className="atw-status atw-status-idle">Non-working day</div>}
      </div>

      <div className={`atw-timer ${activeBreak ? 'atw-timer-paused' : ''}`}>
        {isWeekend && !record ? '—' : fmtSeconds(workedMs)}
      </div>

      {activeBreak && (
        <div className="atw-break">Break in progress: {fmtSeconds(breakMs)}</div>
      )}

      {isClockedOut && record && (
        <div className="atw-summary">
          <span>Today: <strong>{fmtDuration(record.totalWorkedMinutes)}</strong> worked</span>
          <span>Break: <strong>{fmtDuration(record.totalBreakMinutes)}</strong></span>
          <span>Overtime: <strong>{fmtDuration(record.overtimeMinutes)}</strong></span>
        </div>
      )}

      <div className="atw-actions">
        {!record && !isWeekend && (
          <Button
            variant="primary"
            size="lg"
            leadingIcon={<Play size={16} />}
            onClick={() => clockIn(user.id)}
          >
            Clock In
          </Button>
        )}
        {isWeekend && !record && (
          <Button variant="secondary" size="lg" disabled>
            Non-working day
          </Button>
        )}
        {isClockedIn && !activeBreak && (
          <>
            <Button
              variant="secondary"
              size="lg"
              leadingIcon={<Coffee size={16} />}
              onClick={() => startBreak(user.id)}
            >
              Start Break
            </Button>
            <Button
              variant="danger"
              size="lg"
              leadingIcon={<Square size={16} />}
              onClick={() => clockOut(user.id)}
            >
              Clock Out
            </Button>
          </>
        )}
        {isClockedIn && activeBreak && (
          <Button
            variant="success"
            size="lg"
            leadingIcon={<Play size={16} />}
            onClick={() => endBreak(user.id)}
          >
            Resume Work
          </Button>
        )}
        {isClockedOut && (
          <Button variant="secondary" size="lg" disabled>
            See you tomorrow!
          </Button>
        )}
      </div>
    </div>
  );
}
