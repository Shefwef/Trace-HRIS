'use client';
import { useMemo, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAllLeaves, useAllExtraWork, type LeaveStatus } from '@/lib/hooks';
import { initials, avatarColorFor } from '@/lib/session';
import { extraWorkTypeLabel, extraWorkCredit } from '@/lib/leave';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { LeaveReviewDrawer } from '../../components/leave/LeaveReviewDrawer';
import { ExtraWorkReviewDrawer } from '../../components/leave/ExtraWorkReviewDrawer';
import { EmptyState } from '../../components/ui/EmptyState';
import { cx, fmtDate, fmtRelative, leaveTypeShort } from '../../lib/utils';
import type { LeaveType } from '../../lib/types';
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
  const { data: requests = [] } = useAllLeaves();
  const { data: extraWork = [] } = useAllExtraWork();
  const [tab, setTab] = useState<'LEAVES' | 'EXTRA'>('LEAVES');
  const [status, setStatus] = useState<'ALL' | LeaveStatus>('PENDING');
  const [type, setType] = useState<'ALL' | LeaveType>('ALL');
  const [q, setQ] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewExtraId, setReviewExtraId] = useState<string | null>(null);

  const pendingLeaves = requests.filter((r) => r.status === 'PENDING').length;
  const pendingExtras = extraWork.filter((x) => x.status === 'PENDING').length;

  const filtered = useMemo(() => {
    return requests
      .filter((r) => status === 'ALL' || r.status === status)
      .filter((r) => type === 'ALL' || r.leaveType === type)
      .filter((r) => {
        if (!q.trim()) return true;
        const needle = q.trim().toLowerCase();
        return (
          r.employee?.fullName.toLowerCase().includes(needle) ||
          r.reason.toLowerCase().includes(needle) ||
          r.employee?.department?.toLowerCase().includes(needle)
        );
      });
  }, [requests, status, type, q]);

  return (
    <div className="lreq">
      <div className="lreq-head">
        <div>
          <h1>Approvals</h1>
          <p className="muted">Review leave requests and extra-work logs from your team.</p>
        </div>
      </div>

      <div className="lreq-tabs">
        <button
          className={cx('lreq-tab', tab === 'LEAVES' && 'lreq-tab-active')}
          onClick={() => setTab('LEAVES')}
        >
          Leave requests
          <span className="lreq-tab-count">{pendingLeaves}</span>
        </button>
        <button
          className={cx('lreq-tab', tab === 'EXTRA' && 'lreq-tab-active')}
          onClick={() => setTab('EXTRA')}
        >
          Extra work logs
          <span className="lreq-tab-count">{pendingExtras}</span>
        </button>
      </div>

      {tab === 'LEAVES' && (
        <>
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
                  const emp = r.employee;
                  if (!emp) return null;
                  return (
                    <motion.button
                      key={r.id}
                      className="lreq-row"
                      onClick={() => setReviewId(r.id)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      layout
                    >
                      <span className="lreq-emp" data-label="Employee">
                        <Avatar initials={initials(emp.fullName)} color={avatarColorFor(emp.id)} size="sm" imageUrl={emp.avatarUrl} alt={emp.fullName} />
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
          <LeaveReviewDrawer requestId={reviewId} onClose={() => setReviewId(null)} />
        </>
      )}

      {tab === 'EXTRA' && (
        <>
          {extraWork.length === 0 ? (
            <div className="card" style={{ padding: 0 }}>
              <EmptyState
                title="No extra work logs yet"
                body="Employees can log weekend/holiday work from their Attendance page."
              />
            </div>
          ) : (
            <div className="lreq-table">
              <div className="lreq-thead">
                <span>Employee</span>
                <span>Date</span>
                <span>Slot</span>
                <span>Credit</span>
                <span>Reason</span>
                <span>Submitted</span>
                <span>Status</span>
              </div>
              <AnimatePresence initial={false}>
                {extraWork.map((x) => {
                  const emp = x.employee;
                  if (!emp) return null;
                  const credit = extraWorkCredit(x.workType);
                  const statusVar =
                    x.status === 'PENDING' ? 'warning' :
                    x.status === 'APPROVED' ? 'success' : 'danger';
                  return (
                    <motion.button
                      key={x.id}
                      className="lreq-row"
                      onClick={() => setReviewExtraId(x.id)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      layout
                    >
                      <span className="lreq-emp" data-label="Employee">
                        <Avatar initials={initials(emp.fullName)} color={avatarColorFor(emp.id)} size="sm" imageUrl={emp.avatarUrl} alt={emp.fullName} />
                        <span>
                          <strong>{emp.fullName}</strong>
                          <em>{emp.department}</em>
                        </span>
                      </span>
                      <span data-label="Date">{fmtDate(x.workDate, 'd MMM yyyy')}</span>
                      <span data-label="Slot">{extraWorkTypeLabel(x.workType).replace(/\s*\(.*\)/, '')}</span>
                      <span className="mono" data-label="Credit">+{credit}d</span>
                      <span className="lreq-reason" data-label="Reason">{x.reason}</span>
                      <span className="muted" data-label="Submitted">{fmtRelative(x.createdAt)}</span>
                      <span data-label="Status"><Badge variant={statusVar}>{x.status.toLowerCase()}</Badge></span>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
          <ExtraWorkReviewDrawer logId={reviewExtraId} onClose={() => setReviewExtraId(null)} />
        </>
      )}
    </div>
  );
}
