import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Inbox, Users, PlaneTakeoff, CalendarClock, ArrowRight, Send } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useCurrentUser, useStore } from '../../lib/store';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { LeaveReviewDrawer } from '../../components/leave/LeaveReviewDrawer';
import { fmtDate, fmtRelative, leaveTypeShort } from '../../lib/utils';
import type { LeaveRequest, LeaveType } from '../../lib/types';
import './AdminDashboard.css';

const leaveVariant: Record<LeaveType, 'casual' | 'sick' | 'replacement'> = {
  CASUAL: 'casual', SICK: 'sick', REPLACEMENT: 'replacement',
};

export function AdminDashboard() {
  const user = useCurrentUser();
  const users = useStore((s) => s.users);
  const requests = useStore((s) => s.requests);
  const holidays = useStore((s) => s.holidays);
  const sendHoliday = useStore((s) => s.sendHolidayNotice);
  const [reviewReq, setReviewReq] = useState<LeaveRequest | null>(null);

  if (!user) return null;

  const pendingRequests = requests
    .filter((r) => r.status === 'PENDING')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const staff = users.filter((u) => u.role !== 'SUPER_ADMIN');
  const onLeaveToday = requests.filter((r) => {
    const today = new Date().toISOString().slice(0, 10);
    return r.status === 'APPROVED' && r.startDate <= today && r.endDate >= today;
  }).length;

  const upcomingHolidays = holidays
    .filter((h) => new Date(h.date) >= new Date())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 3);

  const approvedLeaves = requests.filter((r) => r.status === 'APPROVED');
  const usageByType = ['CASUAL', 'SICK', 'REPLACEMENT'].map((t) => ({
    name: t,
    value: approvedLeaves
      .filter((r) => r.leaveType === t)
      .reduce((sum, r) => sum + r.durationDays, 0),
    fill:
      t === 'CASUAL'
        ? '#805AD5'
        : t === 'SICK'
        ? '#DD6B20'
        : '#319795',
  }));

  const departmentUsage = Array.from(
    users.reduce((map, u) => {
      if (u.role === 'SUPER_ADMIN') return map;
      const total = requests
        .filter((r) => r.employeeId === u.id && r.status === 'APPROVED')
        .reduce((sum, r) => sum + r.durationDays, 0);
      map.set(u.department, (map.get(u.department) ?? 0) + total);
      return map;
    }, new Map<string, number>()),
    ([name, value]) => ({ name, value })
  );

  return (
    <div className="adash">
      <div className="adash-head">
        <div>
          <h1>Team overview, {user.fullName.split(' ')[0]}</h1>
          <p className="muted">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>
        <Link to="/admin/requests">
          <Button variant="primary" trailingIcon={<ArrowRight size={16} />}>
            Open leave inbox
          </Button>
        </Link>
      </div>

      <div className="adash-stats">
        <StatCard
          label="Pending Requests"
          value={pendingRequests.length}
          hint={pendingRequests.length > 0 ? 'Awaiting your decision' : "You're all caught up!"}
          icon={<Inbox size={16} />}
          accent="warning"
        />
        <StatCard
          label="Present Today"
          value={`${Math.max(staff.length - onLeaveToday, 0)} / ${staff.length}`}
          hint={`${onLeaveToday} on leave`}
          icon={<Users size={16} />}
          accent="success"
        />
        <StatCard
          label="Approved this cycle"
          value={approvedLeaves.reduce((s, r) => s + r.durationDays, 0)}
          hint="Total leave days approved"
          icon={<PlaneTakeoff size={16} />}
          accent="info"
        />
        <StatCard
          label="Next holiday"
          value={upcomingHolidays[0] ? upcomingHolidays[0].name : '—'}
          hint={upcomingHolidays[0] ? fmtDate(upcomingHolidays[0].date) : ''}
          icon={<CalendarClock size={16} />}
          accent="primary"
        />
      </div>

      <div className="adash-grid">
        <motion.section
          className="adash-inbox card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <header className="adash-panel-head">
            <h3>Pending leave requests</h3>
            <Link to="/admin/requests" className="edash-section-link">Review all <ArrowRight size={14} /></Link>
          </header>
          {pendingRequests.length === 0 ? (
            <div className="adash-inbox-empty">
              <Inbox size={24} />
              <div>
                <strong>Inbox zero.</strong>
                <p>No requests need your attention right now.</p>
              </div>
            </div>
          ) : (
            <ul className="adash-inbox-list">
              {pendingRequests.slice(0, 5).map((r) => {
                const emp = users.find((u) => u.id === r.employeeId);
                if (!emp) return null;
                return (
                  <li key={r.id}>
                    <button className="adash-inbox-item" onClick={() => setReviewReq(r)}>
                      <Avatar initials={emp.initials} color={emp.avatarColor} size="md" />
                      <div className="adash-inbox-body">
                        <div className="adash-inbox-title">
                          <strong>{emp.fullName}</strong>
                          <Badge variant={leaveVariant[r.leaveType]}>{leaveTypeShort(r.leaveType)}</Badge>
                        </div>
                        <div className="adash-inbox-meta">
                          {fmtDate(r.startDate, 'd MMM')} – {fmtDate(r.endDate, 'd MMM')} · {r.durationDays} {r.durationDays === 1 ? 'day' : 'days'} · {fmtRelative(r.createdAt)}
                        </div>
                      </div>
                      <span className="adash-inbox-cta">Review <ArrowRight size={12} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.section>

        <motion.section
          className="adash-holidays card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
        >
          <header className="adash-panel-head">
            <h3>Upcoming holidays</h3>
            <Link to="/admin/holidays" className="edash-section-link">Manage <ArrowRight size={14} /></Link>
          </header>
          <ul className="adash-hol-list">
            {upcomingHolidays.length === 0 ? (
              <li className="muted" style={{ padding: 16 }}>No upcoming holidays.</li>
            ) : (
              upcomingHolidays.map((h) => (
                <li key={h.id} className="adash-hol">
                  <div className="adash-hol-date">
                    <div className="adash-hol-day">{new Date(h.date).getDate()}</div>
                    <div className="adash-hol-month">{new Date(h.date).toLocaleString('en', { month: 'short' })}</div>
                  </div>
                  <div className="adash-hol-body">
                    <div className="adash-hol-name">{h.name}</div>
                    <div className="adash-hol-meta">
                      {h.notificationSentAt ? (
                        <span className="adash-hol-sent">✓ Notice sent {fmtRelative(h.notificationSentAt)}</span>
                      ) : (
                        <span className="muted">Notice not sent yet</span>
                      )}
                    </div>
                  </div>
                  {!h.notificationSentAt && (
                    <Button size="sm" variant="secondary" leadingIcon={<Send size={12} />} onClick={() => sendHoliday(h.id)}>
                      Send
                    </Button>
                  )}
                </li>
              ))
            )}
          </ul>
        </motion.section>

        <motion.section
          className="adash-chart card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <header className="adash-panel-head">
            <h3>Leave usage by type</h3>
            <span className="muted">Approved this cycle</span>
          </header>
          <div className="adash-chart-body">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={usageByType}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {usageByType.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border-default)', fontSize: 12 }}
                  formatter={(v, name) => [`${v} days`, String(name).toLowerCase()]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="adash-chart-legend">
              {usageByType.map((d) => (
                <div key={d.name}>
                  <span style={{ background: d.fill }} />
                  <span className="adash-chart-legend-name">{d.name.toLowerCase()}</span>
                  <strong>{d.value}d</strong>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          className="adash-chart card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <header className="adash-panel-head">
            <h3>Leave usage by department</h3>
            <span className="muted">Approved days</span>
          </header>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={departmentUsage} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-bg-muted)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--color-bg-subtle)' }}
                contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border-default)', fontSize: 12 }}
              />
              <Bar dataKey="value" fill="#3182CE" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.section>
      </div>

      <LeaveReviewDrawer request={reviewReq} onClose={() => setReviewReq(null)} />
    </div>
  );
}
