'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from 'recharts';
import { TrendingUp, TrendingDown, Award, Target } from 'lucide-react';
import { useCurrentUser } from '@/lib/session';
import { useBalance, useMyLeaves, useAttendanceHistory, useSettings } from '@/lib/hooks';
import { StatCard } from '../../components/ui/StatCard';
import { AttendanceHeatmap } from './AttendanceHeatmap';
import './Analytics.css';

export function AnalyticsPage() {
  const user = useCurrentUser();
  const { data: balance, isLoading: balanceLoading } = useBalance();
  const { data: myLeaves, isLoading: leavesLoading } = useMyLeaves();
  const now = new Date();
  const { data: history, isLoading: historyLoading } = useAttendanceHistory(
    now.getFullYear(),
    now.getMonth() + 1,
  );
  const { data: settings } = useSettings();

  const approved = useMemo(
    () => (myLeaves ?? []).filter((r) => r.status === 'APPROVED'),
    [myLeaves],
  );

  // Pre-joining days shouldn't count against attendance metrics.
  const joiningDate = history?.joiningDate ?? null;
  const records = (history?.records ?? []).filter(
    (r) => !joiningDate || r.date >= joiningDate,
  );

  const leaveTypeData = useMemo(() => {
    if (!balance) return [];
    return [
      { name: 'Casual', value: balance.casualUsed, fill: '#805AD5' },
      { name: 'Sick', value: balance.sickUsed, fill: '#DD6B20' },
      { name: 'Replacement', value: Math.max(0, balance.replacementBalance), fill: '#319795' },
    ];
  }, [balance]);

  const trendData = useMemo(
    () =>
      records
        .filter((a) => a.totalWorkedMinutes > 0)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((a) => ({
          day: new Date(a.date).getDate(),
          hours: +(a.totalWorkedMinutes / 60).toFixed(2),
        })),
    [records],
  );

  const cumulativeLeaves = useMemo(
    () =>
      approved
        .slice()
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .reduce(
          (acc, r, i) => {
            acc.push({ n: i + 1, days: (acc[i - 1]?.days ?? 0) + r.durationDays });
            return acc;
          },
          [] as { n: number; days: number }[],
        ),
    [approved],
  );

  const totalLeaves = (balance?.casualUsed ?? 0) + (balance?.sickUsed ?? 0);
  const totalDays = (balance?.casualTotal ?? 12) + (balance?.sickTotal ?? 12);
  const utilization = totalDays === 0 ? 0 : Math.round((totalLeaves / totalDays) * 100);
  const presentDays = records.filter((a) => a.status === 'PRESENT').length;
  const workDays = records.filter((a) => a.status !== 'WEEKEND' && a.status !== 'HOLIDAY').length;
  const rate = workDays === 0 ? 0 : Math.round((presentDays / workDays) * 100);
  const overtimeHours = records.reduce((sum, a) => sum + a.overtimeMinutes / 60, 0);
  const absentDays = records.filter((a) => a.status === 'ABSENT').length;

  const loading = balanceLoading || leavesLoading || historyLoading;

  if (!user) return null;
  if (loading) {
    return (
      <div className="anpg">
        <div className="anpg-head">
          <h1>Your analytics</h1>
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  const hasAnyData = records.length > 0 || approved.length > 0 || totalLeaves > 0;

  return (
    <div className="anpg">
      <div className="anpg-head">
        <h1>Your analytics</h1>
        <p className="muted">
          A calm view of your leave usage, attendance rate and overtime — no jargon.
        </p>
      </div>

      <div className="anpg-stats">
        <StatCard
          label="Attendance rate"
          value={`${rate}%`}
          hint={`${presentDays} of ${workDays} working days this month`}
          icon={<Target size={16} />}
          accent="success"
        />
        <StatCard
          label="Leave utilization"
          value={`${utilization}%`}
          hint={`${totalLeaves} of ${totalDays} annual days used`}
          icon={<TrendingUp size={16} />}
          accent="info"
        />
        <StatCard
          label="Overtime this month"
          value={`${overtimeHours.toFixed(1)}h`}
          hint="Beyond your standard hours"
          icon={<Award size={16} />}
          accent="warning"
        />
        <StatCard
          label="Absences this month"
          value={absentDays}
          hint="Unexcused missed workdays"
          icon={<TrendingDown size={16} />}
          accent="danger"
        />
      </div>

      <AttendanceHeatmap
        records={records}
        leaves={myLeaves ?? []}
        workDaysBitmask={settings?.workDaysBitmask ?? 62}
        startHour={settings?.workStartTime ? Number(settings.workStartTime.split(':')[0]) : 9}
        endHour={settings?.workEndTime ? Number(settings.workEndTime.split(':')[0]) : 17}
      />

      {!hasAnyData ? (
        <div className="card anpg-panel anpg-empty">
          <h3>Not much data yet</h3>
          <p className="muted">
            As you clock in each day and take leave through the cycle, this
            page fills in with your trends. Come back after a few days of use.
          </p>
        </div>
      ) : (
        <motion.div
          className="anpg-grid"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="card anpg-panel">
            <header><h3>Leave distribution</h3><span className="muted">Days used this cycle</span></header>
            <div className="anpg-donut">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={leaveTypeData} innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={4}>
                    {leaveTypeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border-default)', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="anpg-donut-legend">
                {leaveTypeData.map((d) => (
                  <div key={d.name}>
                    <span style={{ background: d.fill }} />
                    <span>{d.name}</span>
                    <strong>{d.value}d</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card anpg-panel">
            <header><h3>Working hours trend</h3><span className="muted">This month</span></header>
            {trendData.length === 0 ? (
              <p className="muted anpg-empty-inline">No clocked-in sessions yet this month.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hoursGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#3182CE" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3182CE" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bg-muted)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis unit="h" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border-default)', fontSize: 12 }} />
                  <Area type="monotone" dataKey="hours" stroke="#3182CE" strokeWidth={2.4} fill="url(#hoursGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card anpg-panel anpg-panel-wide">
            <header><h3>Cumulative leaves taken</h3><span className="muted">Across the current cycle</span></header>
            {cumulativeLeaves.length === 0 ? (
              <p className="muted anpg-empty-inline">No approved leaves yet this cycle.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={cumulativeLeaves} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bg-muted)" />
                  <XAxis dataKey="n" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} unit="d" />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border-default)', fontSize: 12 }} />
                  <Line dataKey="days" stroke="#805AD5" strokeWidth={2.4} dot={{ r: 3, fill: '#805AD5' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
