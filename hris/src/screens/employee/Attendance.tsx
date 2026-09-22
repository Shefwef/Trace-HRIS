'use client';
import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, BarChart } from 'recharts';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Coffee, Zap, Plus, Building2, MapPin, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { useAttendanceHistory, useBalance, type AttendanceRecordData, type LocationEventSummary } from '@/lib/hooks';
import { AttendanceWidget } from '../../components/attendance/AttendanceWidget';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { LogExtraWorkModal } from '../../components/attendance/LogExtraWorkModal';
import { fmtDate, fmtDuration, fmtTime } from '../../lib/utils';
import './Attendance.css';

type DayEntry =
  | { kind: 'record'; record: AttendanceRecordData }
  | { kind: 'empty'; date: string; isWeekend: boolean };

export function AttendancePage() {
  const [extraOpen, setExtraOpen] = useState(false);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayDate = now.getDate();

  const { data } = useAttendanceHistory(year, month);
  const { data: balance } = useBalance();

  // Employee joining date: pre-joining days are not counted as absent and
  // are hidden from the daily breakdown entirely.
  const joiningDate = data?.joiningDate ?? null;

  const attendance = useMemo(
    () => (data?.records ?? [])
      .filter((r) => !joiningDate || r.date >= joiningDate)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data, joiningDate]
  );

  // Full month calendar from day 1 to today, filling empty days with virtual rows
  const allDays = useMemo<DayEntry[]>(() => {
    const byDate = new Map((data?.records ?? []).map((r) => [r.date, r]));
    const entries: DayEntry[] = [];
    for (let d = todayDate; d >= 1; d--) {
      const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      // Skip days before the employee joined — they weren't employed yet.
      if (joiningDate && ds < joiningDate) continue;
      const rec = byDate.get(ds);
      if (rec) {
        entries.push({ kind: 'record', record: rec });
      } else {
        // Use noon to avoid any local-midnight ambiguity when reading getDay()
        const dow = new Date(`${ds}T12:00:00`).getDay();
        // Bangladesh weekend: Friday (5) + Saturday (6)
        entries.push({ kind: 'empty', date: ds, isWeekend: dow === 5 || dow === 6 });
      }
    }
    return entries;
  }, [data, year, month, todayDate, joiningDate]);

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
            <span>Location</span>
          </div>
          {allDays.map((entry) =>
            entry.kind === 'record'
              ? <AttendanceRow key={entry.record.id} record={entry.record} />
              : <EmptyDayRow key={entry.date} date={entry.date} isWeekend={entry.isWeekend} />
          )}
        </div>
      </div>

      <LogExtraWorkModal open={extraOpen} onClose={() => setExtraOpen(false)} />
    </div>
  );
}

function AttendanceRow({ record: a }: { record: AttendanceRecordData }) {
  const [expanded, setExpanded] = useState(false);
  const locEvents = a.locationEvents ?? [];
  const subEvents = locEvents.filter((e) => e.eventType !== 'OFFICE_CLOCK_IN');
  const isActive = a.status === 'PRESENT' || a.status === 'HALF_DAY';
  const hasOffsite = locEvents.some((e) => e.eventType === 'OFFSITE_STARTED');
  const canExpand = isActive && subEvents.length > 0;

  const summary = !isActive
    ? '—'
    : !hasOffsite
      ? 'Office'
      : 'Office +';

  return (
    <>
      <div className="atpg-row">
        <span data-label="Date">{fmtDate(a.date, 'EEE, d MMM')}</span>
        <span className="mono" data-label="Clock in">{a.clockInTime ? fmtTime(a.clockInTime) : '—'}</span>
        <span className="mono" data-label="Clock out">{a.clockOutTime ? fmtTime(a.clockOutTime) : '—'}</span>
        <span className="mono" data-label="Break">{a.totalBreakMinutes ? fmtDuration(a.totalBreakMinutes) : '—'}</span>
        <span className="mono" data-label="Worked">{a.totalWorkedMinutes ? fmtDuration(a.totalWorkedMinutes) : '—'}</span>
        <span className="mono" data-label="Overtime">{a.overtimeMinutes ? fmtDuration(a.overtimeMinutes) : '—'}</span>
        <span data-label="Status"><StatusDot status={a.status} /></span>
        <span data-label="Location">
          {canExpand ? (
            <button
              type="button"
              className="atpg-loc-btn"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <LocationTag record={a} label={summary} />
            </button>
          ) : isActive ? (
            <LocationTag record={a} label="Office" />
          ) : (
            <span style={{ color: 'var(--color-text-muted)' }}>—</span>
          )}
        </span>
      </div>
      {expanded && subEvents.map((e) => <LocEventRow key={e.id} event={e} />)}
    </>
  );
}

function LocationTag({ record, label }: { record: AttendanceRecordData; label: string }) {
  const events = record.locationEvents ?? [];
  const hasOffsite = events.some((e) => e.eventType === 'OFFSITE_STARTED');
  const color = !hasOffsite
    ? 'var(--color-success)'
    : record.workLocation === 'OFFSITE'
      ? 'var(--color-warning)'
      : 'var(--color-info, #3182CE)';
  return (
    <span className="atpg-loc-tag">
      <i style={{ background: color }} />
      <span className="atpg-loc-tag-text" title={label}>{label}</span>
    </span>
  );
}

function LocEventRow({ event: e }: { event: LocationEventSummary }) {
  const labels: Record<string, { icon: React.ReactNode; text: string; color: string }> = {
    OFFSITE_STARTED:          { icon: <MapPin size={10} />,     text: 'Left office',        color: 'var(--color-warning)' },
    RETURNED_TO_OFFICE:       { icon: <ArrowLeft size={10} />,  text: 'Returned to office', color: 'var(--color-success)' },
    OFFSITE_LOCATION_CHANGED: { icon: <MapPin size={10} />,     text: 'Location changed',   color: 'var(--color-info, #3182CE)' },
    ADMIN_CORRECTION:         { icon: <Building2 size={10} />,  text: 'Admin correction',   color: 'var(--color-text-muted)' },
  };
  const lbl = labels[e.eventType] ?? { icon: null, text: e.eventType, color: 'var(--color-text-muted)' };

  return (
    <div className="atpg-loc-row">
      <span className="atpg-loc-time">{fmtTime(e.startedAt)}</span>
      <span className="atpg-loc-badge" style={{ color: lbl.color }}>
        {lbl.icon} {lbl.text}
      </span>
      {(e.placeName || e.formattedAddress) && (
        <span className="atpg-loc-place">
          {e.placeName ?? e.formattedAddress}
        </span>
      )}
      {e.durationMinutes != null && (
        <span className="atpg-loc-dur">{fmtDuration(e.durationMinutes)}</span>
      )}
    </div>
  );
}

function EmptyDayRow({ date, isWeekend }: { date: string; isWeekend: boolean }) {
  return (
    <div className="atpg-row" style={{ opacity: isWeekend ? 0.45 : 0.65 }}>
      <span data-label="Date">{fmtDate(date, 'EEE, d MMM')}</span>
      <span className="mono" data-label="Clock in" style={{ color: 'var(--color-text-muted)' }}>—</span>
      <span className="mono" data-label="Clock out" style={{ color: 'var(--color-text-muted)' }}>—</span>
      <span className="mono" data-label="Break" style={{ color: 'var(--color-text-muted)' }}>—</span>
      <span className="mono" data-label="Worked" style={{ color: 'var(--color-text-muted)' }}>—</span>
      <span className="mono" data-label="Overtime" style={{ color: 'var(--color-text-muted)' }}>—</span>
      <span data-label="Status">
        <StatusDot status={isWeekend ? 'WEEKEND' : 'ABSENT'} />
      </span>
      <span data-label="Location" style={{ color: 'var(--color-text-muted)', justifyContent: 'center', display: 'flex' }}>—</span>
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
