'use client';
import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, BarChart } from 'recharts';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Coffee, Zap, Plus } from 'lucide-react';
import { useAttendanceHistory, useBalance } from '@/lib/hooks';
import { AttendanceWidget } from '../../components/attendance/AttendanceWidget';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { LogExtraWorkModal } from '../../components/attendance/LogExtraWorkModal';
import { fmtDate, fmtDuration, fmtTime } from '../../lib/utils';
import './Attendance.css';

export function AttendancePage() {
  const [extraOpen, setExtraOpen] = useState(false);
  const now = new Date();
  const { data } = useAttendanceHistory(now.getFullYear(), now.getMonth() + 1);
  const { data: balance } = useBalance();

  const attendance = useMemo(
    () => (data?.records ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data]
  );

  const present = attendance.filter((a) => a.status === 'PRESENT').length;
  const absent = attendance.filter((a) => a.status === 'ABSENT').length;
  const onLeave = attendance.filter((a) => a.status === 'LEAVE').length;
  const overtimeMin = attendance.reduce((s, a) => s + a.overtimeMinutes, 0);

  const dailyHours = attendance
    .slice()
    .reverse()
    .filter((a) => a.totalWorkedMinutes > 0)
    .map((a) => ({
      day: new Date(a.date).getUTCDate(),
      hours: +(a.totalWorkedMinutes / 60).toFixed(2),
      overtime: +(a.overtimeMinutes / 60).toFixed(2),
    }));

  return (
    <div className="atpg">
      <div className="atpg-head">
        <div>
          <h1>Attendance</h1>
          <p className="muted">Your working hours, breaks and overtime this month.</p>
        </div>
        <Button variant="secondary" leadingIcon={<Plus size={16} />} onClick={() => setExtraOpen(true)}>
          Log extra work day
        </Button>
      </div>

      <div className="atpg-top">
        <AttendanceWidget />
        <div className="card atpg-extra-card">
          <div className="atpg-extra-head">
            <h3>Replacement leave</h3>
            <span className="mono">{balance?.replacementBalance ?? 0} days</span>
          </div>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
            Worked on a weekend or holiday? Log it here to earn replacement leave — a full day = +1,
            a half day (9–1 or 1–5) = +0.5. HR or Admin approves.
          </p>
          <Button
            variant="primary"
            leadingIcon={<Plus size={16} />}
            onClick={() => setExtraOpen(true)}
          >
            Log extra work day
          </Button>
        </div>
      </div>

      <div className="atpg-stats">
        <StatCard label="Present days" value={present} hint="This month" icon={<CheckCircle2 size={16} />} accent="success" />
        <StatCard label="Absent days" value={absent} icon={<XCircle size={16} />} accent="danger" />
        <StatCard label="Leaves taken" value={onLeave} icon={<Coffee size={16} />} accent="info" />
        <StatCard label="Total overtime" value={fmtDuration(overtimeMin)} icon={<Zap size={16} />} accent="warning" />
      </div>

      <motion.div
        className="atpg-charts"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="card atpg-chart">
          <header className="atpg-chart-head">
            <h3>Daily hours worked</h3>
            <span className="muted">This month</span>
          </header>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyHours} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bg-muted)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} unit="h" />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border-default)', fontSize: 12 }} />
              <Line type="monotone" dataKey="hours" stroke="#3182CE" strokeWidth={2.4} dot={{ r: 3, fill: '#3182CE' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card atpg-chart">
          <header className="atpg-chart-head">
            <h3>Daily overtime</h3>
            <span className="muted">Beyond 8h/day</span>
          </header>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyHours} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bg-muted)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} unit="h" />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border-default)', fontSize: 12 }} />
              <Bar dataKey="overtime" fill="#319795" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <div className="card atpg-table-card">
        <header className="atpg-panel-head">
          <h3>Daily breakdown</h3>
          <span className="muted">All days this month</span>
        </header>
        <div className="atpg-table">
          <div className="atpg-thead">
            <span>Date</span>
            <span>Clock In</span>
            <span>Clock Out</span>
            <span>Break</span>
            <span>Worked</span>
            <span>Overtime</span>
            <span>Status</span>
          </div>
          {attendance.length === 0 ? (
            <div className="atpg-row" style={{ gridTemplateColumns: '1fr', color: 'var(--color-text-muted)', padding: 24, justifyContent: 'center' }}>
              No attendance records this month yet.
            </div>
          ) : (
            attendance.map((a) => (
              <div key={a.id} className="atpg-row">
                <span data-label="Date">{fmtDate(a.date, 'EEE, d MMM')}</span>
                <span className="mono" data-label="Clock in">{a.clockInTime ? fmtTime(a.clockInTime) : '—'}</span>
                <span className="mono" data-label="Clock out">{a.clockOutTime ? fmtTime(a.clockOutTime) : '—'}</span>
                <span className="mono" data-label="Break">{a.totalBreakMinutes ? fmtDuration(a.totalBreakMinutes) : '—'}</span>
                <span className="mono" data-label="Worked">{a.totalWorkedMinutes ? fmtDuration(a.totalWorkedMinutes) : '—'}</span>
                <span className="mono" data-label="Overtime">{a.overtimeMinutes ? fmtDuration(a.overtimeMinutes) : '—'}</span>
                <span data-label="Status"><StatusDot status={a.status} /></span>
              </div>
            ))
          )}
        </div>
      </div>

      <LogExtraWorkModal open={extraOpen} onClose={() => setExtraOpen(false)} />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    PRESENT:  { color: 'var(--color-success)', label: 'Present' },
    ABSENT:   { color: 'var(--color-danger)', label: 'Absent' },
    HALF_DAY: { color: 'var(--color-warning)', label: 'Half day' },
    LEAVE:    { color: 'var(--color-leave-casual)', label: 'On leave' },
    HOLIDAY:  { color: 'var(--color-leave-holiday)', label: 'Holiday' },
    WEEKEND:  { color: 'var(--color-bg-muted)', label: 'Weekend' },
  };
  const s = map[status] ?? { color: 'var(--color-bg-muted)', label: status };
  return (
    <span className="atpg-status">
      <i style={{ background: s.color }} /> {s.label}
    </span>
  );
}
