import { useMemo, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../lib/store';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { LeaveReviewDrawer } from '../../components/leave/LeaveReviewDrawer';
import { EmptyState } from '../../components/ui/EmptyState';
import { cx, fmtDate, fmtRelative, leaveTypeShort } from '../../lib/utils';
import type { LeaveRequest, LeaveStatus, LeaveType } from '../../lib/types';
import './LeaveRequests.css';

const STATUSES: { key: 'ALL' | LeaveStatus; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'CANCELLED', label: 'Cancelled' },
];
const TYPES: { key: 'ALL' | LeaveType; label: string }[] = [
  { key: 'ALL', label: 'All types' },
  { key: 'CASUAL', label: 'Casual' },
  { key: 'SICK', label: 'Sick' },
  { key: 'REPLACEMENT', label: 'Replacement' },
];

const statusVariant: Record<LeaveStatus, 'warning' | 'success' | 'danger' | 'default'> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'default',
};
const leaveVariant: Record<LeaveType, 'casual' | 'sick' | 'replacement'> = {
  CASUAL: 'casual', SICK: 'sick', REPLACEMENT: 'replacement',
};

export function LeaveRequestsPage() {
  const users = useStore((s) => s.users);
  const requests = useStore((s) => s.requests);
  const [status, setStatus] = useState<'ALL' | LeaveStatus>('PENDING');
  const [type, setType] = useState<'ALL' | LeaveType>('ALL');
  const [q, setQ] = useState('');
  const [reviewReq, setReviewReq] = useState<LeaveRequest | null>(null);

  const filtered = useMemo(() => {
    return requests
      .filter((r) => status === 'ALL' || r.status === status)
      .filter((r) => type === 'ALL' || r.leaveType === type)
      .filter((r) => {
        if (!q.trim()) return true;
        const emp = users.find((u) => u.id === r.employeeId);
        const needle = q.trim().toLowerCase();
        return (
          emp?.fullName.toLowerCase().includes(needle) ||
          r.reason.toLowerCase().includes(needle) ||
          emp?.department.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [requests, status, type, q, users]);

  return (
    <div className="lreq">
      <div className="lreq-head">
        <div>
          <h1>Leave requests</h1>
          <p className="muted">Review, approve or reject requests from your team.</p>
        </div>
      </div>

      <div className="lreq-filters">
        <div className="lreq-search">
          <Search size={14} />
          <input
            placeholder="Search by name, reason or department…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="lreq-pillrow">
          <div className="lreq-pillgroup">
            <Filter size={12} />
            {STATUSES.map((s) => (
              <button
                key={s.key}
                className={cx('lreq-pill', status === s.key && 'lreq-pill-active')}
                onClick={() => setStatus(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="lreq-pillgroup">
            {TYPES.map((t) => (
              <button
                key={t.key}
                className={cx('lreq-pill', type === t.key && 'lreq-pill-active')}
                onClick={() => setType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <EmptyState
            title="Nothing matches these filters"
            body="Try clearing filters or picking a different status."
          />
        </div>
      ) : (
        <div className="lreq-table">
          <div className="lreq-thead">
            <span>Employee</span>
            <span>Type</span>
            <span>Period</span>
            <span>Duration</span>
            <span>Reason</span>
            <span>Applied</span>
            <span>Status</span>
          </div>
          <AnimatePresence initial={false}>
            {filtered.map((r) => {
              const emp = users.find((u) => u.id === r.employeeId);
              if (!emp) return null;
              return (
                <motion.button
                  key={r.id}
                  className="lreq-row"
                  onClick={() => setReviewReq(r)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  layout
                >
                  <span className="lreq-emp" data-label="Employee">
                    <Avatar initials={emp.initials} color={emp.avatarColor} size="sm" />
                    <span>
                      <strong>{emp.fullName}</strong>
                      <em>{emp.department}</em>
                    </span>
                  </span>
                  <span data-label="Type"><Badge variant={leaveVariant[r.leaveType]}>{leaveTypeShort(r.leaveType)}</Badge></span>
                  <span data-label="Period">{fmtDate(r.startDate, 'd MMM')} – {fmtDate(r.endDate, 'd MMM')}</span>
                  <span className="mono" data-label="Days">{r.durationDays}d</span>
                  <span className="lreq-reason" data-label="Reason">{r.reason}</span>
                  <span className="muted" data-label="Applied">{fmtRelative(r.createdAt)}</span>
                  <span data-label="Status"><Badge variant={statusVariant[r.status]}>{r.status.toLowerCase()}</Badge></span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <LeaveReviewDrawer request={reviewReq} onClose={() => setReviewReq(null)} />
    </div>
  );
}
