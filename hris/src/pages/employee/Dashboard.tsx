import { useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, ClipboardList, Plus, TrendingUp, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useCurrentUser, useStore } from '../../lib/store';
import { AttendanceWidget } from '../../components/attendance/AttendanceWidget';
import { LeaveBalanceCards } from '../../components/leave/LeaveBalanceCards';
import { MiniCalendar } from '../../components/attendance/MiniCalendar';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LeaveApplicationFlow } from '../../components/leave/LeaveApplicationFlow';
import { fmtDateShort, fmtRelative, leaveTypeLabel, leaveTypeShort } from '../../lib/utils';
import type { LeaveStatus, LeaveType } from '../../lib/types';
import './Dashboard.css';

const statusVariant: Record<LeaveStatus, 'warning' | 'success' | 'danger' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'default',
};

const leaveVariant: Record<LeaveType, 'casual' | 'sick' | 'replacement'> = {
  CASUAL: 'casual',
  SICK: 'sick',
  REPLACEMENT: 'replacement',
};

export function EmployeeDashboard() {
  const user = useCurrentUser();
  const [applyOpen, setApplyOpen] = useState(false);
  const allBalances = useStore((s) => s.balances);
  const holidays = useStore((s) => s.holidays);
  const allRequests = useStore((s) => s.requests);
  const balance = useMemo(
    () => allBalances.find((b) => b.employeeId === user?.id),
    [allBalances, user?.id]
  );
  const requests = useMemo(
    () =>
      allRequests
        .filter((r) => r.employeeId === user?.id)
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 4),
    [allRequests, user?.id]
  );

  if (!user || !balance) return null;

  const upcomingHoliday = holidays
    .filter((h) => new Date(h.date) >= new Date())
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  return (
    <div className="edash">
      <div className="edash-hero">
        <div>
          <h1>Good morning, {user.fullName.split(' ')[0]}. Ready to make today count?</h1>
          <p className="edash-hero-sub">
            Here's a quick look at your time, leaves and what's coming up.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          leadingIcon={<Plus size={16} />}
          onClick={() => setApplyOpen(true)}
        >
          Apply for Leave
        </Button>
      </div>

      <div className="edash-grid">
        <div className="edash-col-left">
          <AttendanceWidget />

          <section className="edash-section">
            <div className="edash-section-head">
              <h3>Your leave balances</h3>
              <span className="edash-section-hint">
                Cycle: {fmtDateShort(balance.cycleStartDate)} –{' '}
                {fmtDateShort(balance.cycleEndDate)}
              </span>
            </div>
            <LeaveBalanceCards balance={balance} />
          </section>

          <section className="edash-section">
            <div className="edash-section-head">
              <h3>Recent leave activity</h3>
              <Link to="/leaves" className="edash-section-link">
                See all <ArrowRight size={14} />
              </Link>
            </div>
            {requests.length === 0 ? (
              <motion.div
                className="edash-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <ClipboardList size={22} />
                <div>
                  <strong>No leave requests yet</strong>
                  <p>Once you apply for a leave, it will show up here.</p>
                </div>
              </motion.div>
            ) : (
              <ul className="edash-activity">
                {requests.map((r) => (
                  <li key={r.id}>
                    <Badge variant={leaveVariant[r.leaveType]}>
                      {leaveTypeShort(r.leaveType)}
                    </Badge>
                    <div className="edash-activity-body">
                      <div className="edash-activity-title">
                        {leaveTypeLabel(r.leaveType)} · {fmtDateShort(r.startDate)}
                        {r.startDate !== r.endDate && ` – ${fmtDateShort(r.endDate)}`}
                      </div>
                      <div className="edash-activity-meta">
                        {r.durationDays} {r.durationDays === 1 ? 'day' : 'days'} ·{' '}
                        {fmtRelative(r.createdAt)}
                      </div>
                    </div>
                    <Badge variant={statusVariant[r.status]}>
                      {r.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="edash-col-right">
          {upcomingHoliday && (
            <motion.div
              className="edash-highlight"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="edash-highlight-icon">
                <CalendarClock size={18} />
              </div>
              <div>
                <div className="edash-highlight-title">Next holiday</div>
                <div className="edash-highlight-body">
                  <strong>{upcomingHoliday.name}</strong> on{' '}
                  {fmtDateShort(upcomingHoliday.date)}
                </div>
              </div>
            </motion.div>
          )}

          <motion.div
            className="edash-tip"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="edash-tip-icon">
              <Sparkles size={16} />
            </div>
            <div className="edash-tip-body">
              <strong>You've earned {balance.replacementBalance} replacement day{balance.replacementBalance === 1 ? '' : 's'}</strong>
              <p>Great work! Overtime beyond 8 hrs converts into replacement leave.</p>
            </div>
          </motion.div>

          <MiniCalendar />

          <motion.div
            className="edash-perf"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="edash-perf-head">
              <TrendingUp size={16} />
              This month, at a glance
            </div>
            <ul>
              <li>
                <span>Attendance rate</span>
                <strong>96%</strong>
              </li>
              <li>
                <span>Days worked</span>
                <strong>13</strong>
              </li>
              <li>
                <span>Overtime hours</span>
                <strong>2h 30m</strong>
              </li>
              <li>
                <span>Leaves taken</span>
                <strong>2</strong>
              </li>
            </ul>
          </motion.div>
        </div>
      </div>

      <LeaveApplicationFlow open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}
