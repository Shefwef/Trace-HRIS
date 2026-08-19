import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Award, Target } from 'lucide-react';
import { useCurrentUser, useStore } from '../../lib/store';
import { StatCard } from '../../components/ui/StatCard';
import './Analytics.css';

export function AnalyticsPage() {
  const user = useCurrentUser();
  const allBalances = useStore((s) => s.balances);
  const allRequests = useStore((s) => s.requests);
  const allAttendance = useStore((s) => s.attendance);
  const balance = useMemo(
    () => allBalances.find((b) => b.employeeId === user?.id),
    [allBalances, user?.id]
  );
  const requests = useMemo(
    () => allRequests.filter((r) => r.employeeId === user?.id && r.status === 'APPROVED'),
    [allRequests, user?.id]
  );
  const attendance = useMemo(
    () => allAttendance.filter((a) => a.employeeId === user?.id),
    [allAttendance, user?.id]
  );

  if (!user || !balance) return null;

  const leaveTypeData = [
    { name: 'Casual', value: balance.casualUsed, fill: '#805AD5' },
    { name: 'Sick', value: balance.sickUsed, fill: '#DD6B20' },
    { name: 'Replacement', value: 0, fill: '#319795' },
  ];

  const trendData = attendance
    .filter((a) => a.totalWorkedMinutes > 0)
    .slice()
    .reverse()
    .map((a) => ({
      day: new Date(a.date).getDate(),
      hours: +(a.totalWorkedMinutes / 60).toFixed(2),
    }));

  const cumulativeLeaves = requests.reduce((acc, r, i) => {
    acc.push({ n: i + 1, days: (acc[i - 1]?.days ?? 0) + r.durationDays });
    return acc;
  }, [] as { n: number; days: number }[]);

  const totalLeaves = balance.casualUsed + balance.sickUsed;
  const totalDays = 24;
  const utilization = Math.round((totalLeaves / totalDays) * 100);
  const presentDays = attendance.filter((a) => a.status === 'PRESENT').length;
  const workDays = attendance.filter((a) => a.status !== 'WEEKEND').length;
  const rate = workDays === 0 ? 0 : Math.round((presentDays / workDays) * 100);

  return (
    <div className="anpg">
      <div className="anpg-head">
        <h1>Your analytics</h1>
        <p className="muted">
          A calm view of your leave usage, attendance rate and overtime — no jargon.
        </p>
      </div>

      <div className="anpg-stats">
        <StatCard label="Attendance rate" value={`${rate}%`} hint={`${presentDays} of ${workDays} working days`} icon={<Target size={16} />} accent="success" />
        <StatCard label="Leave utilization" value={`${utilization}%`} hint={`${totalLeaves} of ${totalDays} annual days used`} icon={<TrendingUp size={16} />} accent="info" />
        <StatCard label="Overtime bank" value={`${balance.overtimeHoursBank.toFixed(1)}h`} hint="Accumulating toward next replacement day" icon={<Award size={16} />} accent="warning" />
        <StatCard label="Absences" value={attendance.filter(a => a.status === 'ABSENT').length} hint="Unexcused this cycle" icon={<TrendingDown size={16} />} accent="danger" />
      </div>

      <motion.div className="anpg-grid" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
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
          <header><h3>Working hours trend</h3><span className="muted">Recent days</span></header>
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
        </div>

        <div className="card anpg-panel anpg-panel-wide">
          <header><h3>Cumulative leaves taken</h3><span className="muted">Across the current cycle</span></header>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cumulativeLeaves} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bg-muted)" />
              <XAxis dataKey="n" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} unit="d" />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border-default)', fontSize: 12 }} />
              <Line dataKey="days" stroke="#805AD5" strokeWidth={2.4} dot={{ r: 3, fill: '#805AD5' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
