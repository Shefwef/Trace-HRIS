import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, XCircle, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMyLeaves, useCancelLeave, type LeaveRequestSummary, type LeaveStatus } from '@/lib/hooks';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { cx, fmtDate, fmtRelative, leaveTypeLabel, leaveTypeShort } from '../../lib/utils';
import type { LeaveType } from '../../lib/types';
import './MyLeaves.css';

const STATUS_FILTERS: { key: 'ALL' | LeaveStatus; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const statusVariant: Record<LeaveStatus, 'warning' | 'success' | 'danger' | 'default'> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'default',
};
const leaveVariant: Record<LeaveType, 'casual' | 'sick' | 'replacement'> = {
  CASUAL: 'casual', SICK: 'sick', REPLACEMENT: 'replacement',
};

/**
 * A visual list entry — either a standalone request or a bundle wrapping
 * the multi-type items submitted together from the new Apply page.
 */
type Entry =
  | { kind: 'single'; row: LeaveRequestSummary }
  | { kind: 'bundle'; bundleId: string; items: LeaveRequestSummary[]; representative: LeaveRequestSummary };

/**
 * The detail modal renders either a single request or an entire bundle.
 * `items` is the list of leaves to show; for a single-type request it's a
 * one-element array, for a multi-type bundle it's every sibling row.
 */
interface DetailPayload {
  items: LeaveRequestSummary[];
  bundleId: string | null;
}

export function MyLeaves() {
  const router = useRouter();
  const { data: requests = [], isLoading } = useMyLeaves();
  const cancel = useCancelLeave();
  const [filter, setFilter] = useState<'ALL' | LeaveStatus>('ALL');
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);

  const filtered = requests.filter((r) => filter === 'ALL' || r.status === filter);

  // Group rows sharing a bundleId. A bundle's status/date shown at the header
  // level uses the first item; users expand to see per-type breakdown.
  const entries: Entry[] = useMemo(() => {
    const byBundle = new Map<string, LeaveRequestSummary[]>();
    const out: Entry[] = [];
    for (const r of filtered) {
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
        // Bundle with only one type — render it inline like a single row.
        out.push({ kind: 'single', row: items[0] });
      } else {
        // Newest first — matches the API's ordering for standalone rows.
        items.sort((a, b) => a.leaveType.localeCompare(b.leaveType));
        out.push({ kind: 'bundle', bundleId, items, representative: items[0] });
      }
    }
    return out.sort((a, b) => {
      const ta = a.kind === 'single' ? a.row.createdAt : a.representative.createdAt;
      const tb = b.kind === 'single' ? b.row.createdAt : b.representative.createdAt;
      return tb.localeCompare(ta);
    });
  }, [filtered]);

  return (
    <div className="myleaves">
      <div className="myleaves-head">
        <div>
          <h1>My leave requests</h1>
          <p className="muted">Everything you've applied for, in one place.</p>
        </div>
        <div className="myleaves-head-actions">
          <label className="myleaves-filter">
            <span className="myleaves-filter-label">Filter</span>
            <select
              className="form-input myleaves-filter-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'ALL' | LeaveStatus)}
            >
              {STATUS_FILTERS.map((f) => {
                const count = f.key === 'ALL' ? requests.length : requests.filter((r) => r.status === f.key).length;
                return (
                  <option key={f.key} value={f.key}>
                    {f.label} ({count})
                  </option>
                );
              })}
            </select>
          </label>
          <Button
            variant="primary"
            leadingIcon={<Plus size={16} />}
            onClick={() => router.push('/leaves/apply')}
          >
            Apply for Leave
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="card myleaves-loading">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <EmptyState
            title="No leave requests"
            body={
              filter === 'ALL'
                ? "You haven't applied for any leave yet."
                : `No requests match the "${filter.toLowerCase()}" filter.`
            }
            action={
              filter === 'ALL' && (
                <Button
                  variant="primary"
                  leadingIcon={<Plus size={16} />}
                  onClick={() => router.push('/leaves/apply')}
                >
                  Apply for Leave
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="myleaves-table">
          <div className="myleaves-thead">
            <span>#</span>
            <span>Type</span>
            <span>Period</span>
            <span>Duration</span>
            <span>Status</span>
            <span>Applied</span>
            <span aria-hidden="true"></span>
          </div>
          <AnimatePresence initial={false}>
            {entries.map((entry, idx) => {
              const rep = entry.kind === 'single' ? entry.row : entry.representative;
              const items = entry.kind === 'single' ? [entry.row] : entry.items;
              const totalDays = items.reduce((s, i) => s + i.durationDays, 0);
              const earliestStart = items.reduce((min, i) => (i.startDate < min ? i.startDate : min), items[0].startDate);
              const latestEnd     = items.reduce((max, i) => (i.endDate > max ? i.endDate : max), items[0].endDate);
              const stat = entry.kind === 'single'
                ? entry.row.status
                : (() => {
                    const set = new Set(items.map((i) => i.status));
                    if (set.size === 1) return items[0].status;
                    const priority: LeaveStatus[] = ['PENDING', 'REJECTED', 'CANCELLED', 'APPROVED'];
                    return priority.find((s) => set.has(s)) ?? 'PENDING';
                  })();
              return (
                <motion.div
                  key={entry.kind === 'single' ? entry.row.id : entry.bundleId}
                  className="myleaves-row"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  layout
                >
                  <span className="myleaves-serial mono" data-label="#">{idx + 1}</span>
                  <span data-label="Type" className="myleaves-types">
                    {items.map((i) => (
                      <Badge key={i.id} variant={leaveVariant[i.leaveType]}>{leaveTypeShort(i.leaveType)}</Badge>
                    ))}
                  </span>
                  <span className="myleaves-period" data-label="Period">
                    <strong>{fmtDate(earliestStart)}</strong>
                    {earliestStart !== latestEnd && <> – <strong>{fmtDate(latestEnd)}</strong></>}
                  </span>
                  <span className="mono" data-label="Duration">
                    {totalDays} {totalDays === 1 ? 'day' : 'days'}
                  </span>
                  <span data-label="Status">
                    <Badge variant={statusVariant[stat]}>{stat.toLowerCase()}</Badge>
                  </span>
                  <span className="muted" data-label="Applied">{fmtRelative(rep.createdAt)}</span>
                  <span data-label="Details">
                    <button
                      type="button"
                      className="myleaves-details-btn"
                      onClick={() => setDetail({ items, bundleId: entry.kind === 'bundle' ? entry.bundleId : null })}
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

      <Modal
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        title="Cancel this leave request?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(null)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmCancel) cancel.mutate(confirmCancel);
                setConfirmCancel(null);
              }}
            >
              Yes, cancel
            </Button>
          </>
        }
      >
        <p>
          Once you cancel, the request will be removed from your admins' inbox. You can always apply again later.
        </p>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={
          detail
            ? (detail.items.length > 1
                ? `Combined leave request · ${detail.items.length} types`
                : `${leaveTypeLabel(detail.items[0].leaveType)} · ${fmtDate(detail.items[0].startDate)}`)
            : ''
        }
        size="lg"
        footer={
          detail && detail.items.some((i) => i.status === 'PENDING') ? (
            <>
              <Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>
              <Button
                variant="danger"
                leadingIcon={<XCircle size={14} />}
                onClick={() => {
                  // Cancel one pending item; server cascades to the whole bundle.
                  const target = detail.items.find((i) => i.status === 'PENDING')!;
                  setDetail(null);
                  setConfirmCancel(target.id);
                }}
              >
                {detail.items.length > 1 ? 'Cancel' : 'Cancel this request'}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>
          )
        }
      >
        {detail && (
          <div className="myleaves-detail">
            <BundleDetail items={detail.items} bundleId={detail.bundleId} />
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * Body of the detail modal. Renders shared fields once (reason, description,
 * attachment, applied timestamp) and then a per-type breakdown card for each
 * item. Bundles show all items; single-type requests show one card.
 */
function BundleDetail({ items, bundleId }: { items: LeaveRequestSummary[]; bundleId: string | null }) {
  const rep = items[0];
  return (
    <>
      <div className="myleaves-detail-row">
        <span className="myleaves-detail-label">Reason</span>
        <span>{rep.reason}</span>
      </div>
      {rep.description && (
        <div className="myleaves-detail-row">
          <span className="myleaves-detail-label">Description</span>
          <span>{rep.description}</span>
        </div>
      )}
      {rep.attachmentUrl && (
        <div className="myleaves-detail-row">
          <span className="myleaves-detail-label">Attachment</span>
          <a href={rep.attachmentUrl} target="_blank" rel="noopener noreferrer" className="myleaves-attach">
            View attachment
          </a>
        </div>
      )}
      <div className="myleaves-detail-row">
        <span className="myleaves-detail-label">Applied</span>
        <span className="muted">{fmtDate(rep.createdAt, 'd MMM yyyy · h:mm a')}</span>
      </div>

      <div className="myleaves-detail-breakdown">
        {items.map((i) => (
          <div key={i.id} className="myleaves-detail-item">
            <div className="myleaves-detail-item-head">
              <Badge variant={leaveVariant[i.leaveType]}>{leaveTypeLabel(i.leaveType)}</Badge>
              <span className="mono myleaves-detail-item-days">
                {i.durationDays} {i.durationDays === 1 ? 'day' : 'days'}
              </span>
              <Badge variant={statusVariant[i.status]}>{i.status.toLowerCase()}</Badge>
            </div>
            <div className="myleaves-detail-item-body">
              <div>
                <span className="myleaves-detail-label">Period</span>
                <span>
                  {fmtDate(i.startDate)}
                  {i.startDate !== i.endDate && ` — ${fmtDate(i.endDate)}`}
                </span>
              </div>
              {i.perDayAllocation && i.perDayAllocation.length > 0 && (
                <div>
                  <span className="myleaves-detail-label">Day-by-day</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {i.perDayAllocation.map((a) => (
                      <span key={a.date} className="mono" style={{ fontSize: 13 }}>
                        {fmtDate(a.date, 'EEE, d MMM')} — {a.slot === 'FULL' ? 'Full day' : a.slot === 'HALF_MORNING' ? 'Half (morning)' : 'Half (afternoon)'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {i.approvedAllocation && i.approvedAllocation.length > 0 && (
                <div>
                  <span className="myleaves-detail-label">Approved as</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {i.approvedAllocation.map((a) => (
                      <span key={a.date} className="mono" style={{ fontSize: 13 }}>
                        {fmtDate(a.date, 'EEE, d MMM')} — {a.slot === 'FULL' ? 'Full day' : a.slot === 'HALF_MORNING' ? 'Half (morning)' : 'Half (afternoon)'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {i.adminNote && (
                <div className="myleaves-detail-note">
                  <MessageCircle size={14} />
                  <div>
                    <strong>Note from reviewer</strong>
                    <p>{i.adminNote}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {bundleId && (
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          These types were submitted together as one bundle — cancelling one cancels all.
        </p>
      )}
    </>
  );
}
