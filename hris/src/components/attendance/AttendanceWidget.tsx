'use client';
import { useEffect, useState } from 'react';
import { Play, Coffee, Square, Timer } from 'lucide-react';
import {
  useToday,
  useClockIn,
  useClockOut,
  useStartBreak,
  useEndBreak,
} from '@/lib/hooks';
import { Button } from '../ui/Button';
import { fmtDuration } from '../../lib/utils';
import './AttendanceWidget.css';

function pad(n: number): string { return n.toString().padStart(2, '0'); }
function fmtSeconds(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function AttendanceWidget() {
  const { data } = useToday();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const startBreak = useStartBreak();
  const endBreak = useEndBreak();

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const record = data?.record;
  const isWeekend = data?.isWeekend ?? false;
  const activeBreak = record?.breaks.find((b) => !b.end);
  const isClockedIn = !!(record?.clockInTime && !record?.clockOutTime);
  const isClockedOut = !!record?.clockOutTime;

  const now = Date.now();
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
  const breakMs = activeBreak ? now - new Date(activeBreak.start).getTime() : 0;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const busy =
    clockIn.isPending || clockOut.isPending || startBreak.isPending || endBreak.isPending;

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
            loading={clockIn.isPending}
            disabled={busy}
            onClick={() => clockIn.mutate()}
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
              loading={startBreak.isPending}
              disabled={busy}
              onClick={() => startBreak.mutate()}
            >
              Start Break
            </Button>
            <Button
              variant="danger"
              size="lg"
              leadingIcon={<Square size={16} />}
              loading={clockOut.isPending}
              disabled={busy}
              onClick={() => clockOut.mutate()}
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
            loading={endBreak.isPending}
            disabled={busy}
            onClick={() => endBreak.mutate()}
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
