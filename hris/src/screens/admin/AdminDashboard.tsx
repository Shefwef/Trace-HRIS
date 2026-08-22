'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Inbox, Users, PlaneTakeoff, CalendarClock, ArrowRight, Send } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useCurrentUser, initials, avatarColorFor } from '@/lib/session';
import { useAllLeaves, useUsers, useHolidays, useSendHolidayNotice } from '@/lib/hooks';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { LeaveReviewDrawer } from '../../components/leave/LeaveReviewDrawer';
import { fmtRelative, leaveTypeShort, fmtDate } from '../../lib/utils';
import type { LeaveType } from '../../lib/types';
import './AdminDashboard.css';

const leaveVariant: Record<LeaveType, 'casual' | 'sick' | 'replacement'> = {
  CASUAL: 'casual', SICK: 'sick', REPLACEMENT: 'replacement',
};

export function AdminDashboard() {
  const user = useCurrentUser();
  const { data: requests = [] } = useAllLeaves();
  const { data: users = [] } = useUsers();
  const { data: holidays = [] } = useHolidays();
  const sendHoliday = useSendHolidayNotice();
  const [reviewId, setReviewId] = useState<string | null>(null);

  const upcomingHolidays = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return holidays.filter((h) => h.date >= today).slice(0, 3);
  }, [holidays]);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === 'PENDING'),
    [requests]
  );
  const approvedLeaves = useMemo(
    () => requests.filter((r) => r.status === 'APPROVED'),
    [requests]
  );
  const staff = useMemo(() => users.filter((u) => u.role !== 'SUPER_ADMIN'), [users]);
  const onLeaveToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return approvedLeaves.filter((r) => r.startDate <= today && r.endDate >= today).length;
  }, [approvedLeaves]);

  const usageByType = ['CASUAL', 'SICK', 'REPLACEMENT'].map((t) => ({
    name: t,
    value: approvedLeaves
      .filter((r) => r.leaveType === t)
      .reduce((sum, r) => sum + r.durationDays, 0),
    fill: t === 'CASUAL' ? '#805AD5' : t === 'SICK' ? '#DD6B20' : '#319795',
  }));

  const departmentUsage = useMemo(
    () =>
      Array.from(
        users.reduce((map, u) => {
          if (u.role === 'SUPER_ADMIN' || !u.department) return map;
          const total = approvedLeaves
            .filter((r) => r.employeeId === u.id)
            .reduce((sum, r) => sum + r.durationDays, 0);
          map.set(u.department, (map.get(u.department) ?? 0) + total);
          return map;
        }, new Map<string, number>()),
        ([name, value]) => ({ name, value })
      ),
    [users, approvedLeaves]
  );

  if (!user) return null;

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
        <Link href="/admin/requests">
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
          hint={upcomingHolidays[0] ? fmtDate(upcomingHolidays[0].date) : 'No upcoming holidays'}
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
            <Link href="/admin/requests" className="edash-section-link">Review all <ArrowRight size={14} /></Link>
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
                const emp = r.employee;
                if (!emp) return null;
                return (
                  <li key={r.id}>
                    <button className="adash-inbox-item" onClick={() => setReviewId(r.id)}>
                      <Avatar initials={initials(emp.fullName)} color={avatarColorFor(emp.id)} size="md" imageUrl={emp.avatarUrl} alt={emp.fullName} />
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
            <Link href="/admin/holidays" className="edash-section-link">Manage <ArrowRight size={14} /></Link>
          </header>
          {upcomingHolidays.length === 0 ? (
            <div className="adash-inbox-empty" style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>
              <CalendarClock size={24} />
              <div>
                <strong>No upcoming holidays</strong>
                <p>Add holidays from the Holiday Manager to see them here.</p>
              </div>
            </div>
          ) : (
            <ul className="adash-hol-list">
              {upcomingHolidays.map((h) => (
                <li key={h.id} className="adash-hol">
                  <div className="adash-hol-date">
                    <div className="adash-hol-day">{new Date(h.date).getUTCDate()}</div>
                    <div className="adash-hol-month">{new Date(h.date).toLocaleString('en', { month: 'short', timeZone: 'UTC' })}</div>
                  </div>
                  <div className="adash-hol-body">
                    <div className="adash-hol-name">{h.name}</div>
                    <div className="adash-hol-meta">
                      {h.notificationSentAt ? (
                        <span className="adash-hol-sent">✓ Notice sent</span>
                      ) : (
                        <span className="muted">Notice pending</span>
                      )}
                    </div>
                  </div>
                  {!h.notificationSentAt && (
                    <Button
                      size="sm"
                      variant="secondary"
                      leadingIcon={<Send size={12} />}
                      loading={sendHoliday.isPending}
                      onClick={() => sendHoliday.mutate(h.id)}
                    >
                      Send
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
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

      <LeaveReviewDrawer requestId={reviewId} onClose={() => setReviewId(null)} />
    </div>
  );
}
