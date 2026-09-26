'use client';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAllLeaves, useAllExtraWork, type LeaveStatus, type LeaveRequestSummary } from '@/lib/hooks';
import { initials, avatarColorFor } from '@/lib/session';
import { extraWorkTypeLabel, extraWorkCredit } from '@/lib/leave';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { LeaveReviewDrawer } from '../../components/leave/LeaveReviewDrawer';
import { ExtraWorkReviewDrawer } from '../../components/leave/ExtraWorkReviewDrawer';
import { EmptyState } from '../../components/ui/EmptyState';
import { cx, fmtDate, fmtRelative } from '../../lib/utils';
import './LeaveRequests.css';

const STATUSES: { key: 'ALL' | LeaveStatus; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const statusVariant: Record<LeaveStatus, 'warning' | 'success' | 'danger' | 'default'> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'default',
};

/** A row in the review queue: either a lone request or a multi-type bundle. */
type Entry =
  | { kind: 'single'; row: LeaveRequestSummary }
  | { kind: 'bundle'; bundleId: string; items: LeaveRequestSummary[]; representative: LeaveRequestSummary };

/**
 * Group rows by bundleId so a multi-type submission occupies a single row.
 * Standalone requests (bundleId=null) or singleton bundles stay as `single`.
 */
function groupEntries(rows: LeaveRequestSummary[]): Entry[] {
  const byBundle = new Map<string, LeaveRequestSummary[]>();
  const out: Entry[] = [];
  for (const r of rows) {
    if (r.bundleId) {
      const arr = byBundle.get(r.bundleId) ?? [];
      arr.push(r);
      byBundle.set(r.bundleId, arr);
    } else {
      out.push({ kind: 'single', row: r });
    }
  }
  for (const [bundleId, items] of byBundle) {
    if (items.length === 1) {
      out.push({ kind: 'single', row: items[0] });
    } else {
      items.sort((a, b) => a.leaveType.localeCompare(b.leaveType));
      out.push({ kind: 'bundle', bundleId, items, representative: items[0] });
    }
  }
  return out.sort((a, b) => {
    const ta = a.kind === 'single' ? a.row.createdAt : a.representative.createdAt;
    const tb = b.kind === 'single' ? b.row.createdAt : b.representative.createdAt;
    return tb.localeCompare(ta);
  });
}

function bundleStatus(items: LeaveRequestSummary[]): LeaveStatus {
  const set = new Set(items.map((i) => i.status));
  if (set.size === 1) return items[0].status;
  const priority: LeaveStatus[] = ['PENDING', 'REJECTED', 'CANCELLED', 'APPROVED'];
  return priority.find((s) => set.has(s)) ?? 'PENDING';
}

export function LeaveRequestsPage() {
  const { data: requests = [] } = useAllLeaves();
  const { data: extraWork = [] } = useAllExtraWork();
  const [tab, setTab] = useState<'LEAVES' | 'EXTRA'>('LEAVES');
  const [status, setStatus] = useState<'ALL' | LeaveStatus>('PENDING');
  const [q, setQ] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewExtraId, setReviewExtraId] = useState<string | null>(null);

  // Count bundles as one "request" — a multi-type submission collapses into
  // a single entry both in the queue and in the pending badge.
  function countEntries(status: LeaveStatus): number {
    const seenBundles = new Set<string>();
    let n = 0;
    for (const r of requests) {
      if (r.status !== status) continue;
      if (r.bundleId) {
        if (seenBundles.has(r.bundleId)) continue;
        seenBundles.add(r.bundleId);
      }
      n++;
    }
    return n;
  }
  const pendingLeaves = countEntries('PENDING');
  const pendingExtras = extraWork.filter((x) => x.status === 'PENDING').length;

  const entries: Entry[] = useMemo(() => {
    // Apply search first (against the flat row list) so bundle rows survive
    // when any of their items match.
    const needle = q.trim().toLowerCase();
    const matches = (r: LeaveRequestSummary) => {
      if (!needle) return true;
      return (
        r.employee?.fullName.toLowerCase().includes(needle) ||
        r.reason.toLowerCase().includes(needle) ||
        r.employee?.department?.toLowerCase().includes(needle)
      );
    };
    const bundleIdsWithMatch = new Set<string>();
    for (const r of requests) {
      if (r.bundleId && matches(r)) bundleIdsWithMatch.add(r.bundleId);
    }
    const filteredRows = requests.filter((r) => {
      if (r.bundleId) return bundleIdsWithMatch.has(r.bundleId);
      return matches(r);
    });
    const grouped = groupEntries(filteredRows);
    // Then filter by status — bundles use their aggregate status.
    return grouped.filter((e) => {
      if (status === 'ALL') return true;
      if (e.kind === 'single') return e.row.status === status;
      return bundleStatus(e.items) === status;
    });
  }, [requests, status, q]);

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
          Replacement Leave
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
            <label className="lreq-filter">
              <span className="lreq-filter-label">Status</span>
              <select
                className="lreq-filter-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'ALL' | LeaveStatus)}
              >
                {STATUSES.map((s) => {
                  const count = s.key === 'ALL'
                    ? entries.length
                    : countEntries(s.key);
                  return (
                    <option key={s.key} value={s.key}>{s.label} ({count})</option>
                  );
                })}
              </select>
            </label>
          </div>

          {entries.length === 0 ? (
            <div className="card" style={{ padding: 0 }}>
              <EmptyState
                title="Nothing matches these filters"
                body="Try clearing the search or picking a different status."
              />
            </div>
          ) : (
            <div className="lreq-table">
              <div className="lreq-thead">
                <span>#</span>
                <span>Employee</span>
                <span>Period</span>
                <span>Duration</span>
                <span>Applied</span>
                <span>Status</span>
                <span aria-hidden="true"></span>
              </div>
              <AnimatePresence initial={false}>
                {entries.map((entry, idx) => {
                  const rep = entry.kind === 'single' ? entry.row : entry.representative;
                  const emp = rep.employee;
                  if (!emp) return null;
                  const items = entry.kind === 'single' ? [entry.row] : entry.items;
                  const earliestStart = items.reduce((min, i) => (i.startDate < min ? i.startDate : min), items[0].startDate);
                  const latestEnd     = items.reduce((max, i) => (i.endDate > max ? i.endDate : max), items[0].endDate);
                  const totalDays     = items.reduce((s, i) => s + i.durationDays, 0);
                  const stat = entry.kind === 'single' ? entry.row.status : bundleStatus(entry.items);
                  return (
                    <motion.div
                      key={entry.kind === 'single' ? entry.row.id : entry.bundleId}
                      className="lreq-row"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      layout
                    >
                      <span className="lreq-serial mono" data-label="#">{idx + 1}</span>
                      <span className="lreq-emp" data-label="Employee">
                        <Avatar initials={initials(emp.fullName)} color={avatarColorFor(emp.id)} size="sm" imageUrl={emp.avatarUrl} alt={emp.fullName} />
                        <span>
                          <strong>{emp.fullName}</strong>
                          <em>{emp.department}</em>
                        </span>
                      </span>
                      <span data-label="Period">
                        <strong>{fmtDate(earliestStart)}</strong>
                        {earliestStart !== latestEnd && <> – <strong>{fmtDate(latestEnd)}</strong></>}
                      </span>
                      <span className="mono" data-label="Duration">{totalDays}d</span>
                      <span className="muted" data-label="Applied">{fmtRelative(rep.createdAt)}</span>
                      <span data-label="Status"><Badge variant={statusVariant[stat]}>{stat.toLowerCase()}</Badge></span>
                      <span data-label="Details">
                        <button
                          type="button"
                          className="lreq-details-btn"
                          onClick={() => setReviewId(rep.id)}
                          title={entry.kind === 'bundle' ? 'View the full combined request' : 'View request details'}
                        >
                          Details
                        </button>
                      </span>
                    </motion.div>
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
            <div className="lreq-table lreq-table-extra">
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
