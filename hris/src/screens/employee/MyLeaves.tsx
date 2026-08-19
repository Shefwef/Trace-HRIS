import { useState } from 'react';
import { Plus, XCircle, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMyLeaves, useCancelLeave, type LeaveRequestSummary, type LeaveStatus } from '@/lib/hooks';
import { LeaveApplicationFlow } from '../../components/leave/LeaveApplicationFlow';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { cx, fmtDate, fmtRelative, leaveTypeLabel, leaveTypeShort } from '../../lib/utils';
import type { LeaveType } from '../../lib/types';
import './MyLeaves.css';

const TABS: { key: 'ALL' | LeaveStatus; label: string }[] = [
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

export function MyLeaves() {
  const { data: requests = [], isLoading } = useMyLeaves();
  const cancel = useCancelLeave();
  const [tab, setTab] = useState<'ALL' | LeaveStatus>('ALL');
  const [applyOpen, setApplyOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeaveRequestSummary | null>(null);

  const filtered = requests.filter((r) => tab === 'ALL' || r.status === tab);

  return (
    <div className="myleaves">
      <div className="myleaves-head">
        <div>
          <h1>My leave requests</h1>
          <p className="muted">Everything you've applied for, in one place.</p>
        </div>
        <Button variant="primary" leadingIcon={<Plus size={16} />} onClick={() => setApplyOpen(true)}>
          Apply for Leave
        </Button>
      </div>

      <div className="myleaves-tabs">
        {TABS.map((t) => {
          const count = t.key === 'ALL' ? requests.length : requests.filter((r) => r.status === t.key).length;
          return (
            <button
              key={t.key}
              className={cx('myleaves-tab', tab === t.key && 'myleaves-tab-active')}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="myleaves-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <EmptyState
            title="No leave requests"
            body={
              tab === 'ALL'
                ? "You haven't applied for any leave yet."
                : `No requests match the "${tab.toLowerCase()}" filter.`
            }
            action={
              tab === 'ALL' && (
                <Button variant="primary" leadingIcon={<Plus size={16} />} onClick={() => setApplyOpen(true)}>
                  Apply for Leave
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="myleaves-table">
          <div className="myleaves-thead">
            <span>Type</span>
            <span>Period</span>
            <span>Duration</span>
            <span>Status</span>
            <span>Applied</span>
            <span>Decided</span>
            <span>Actions</span>
          </div>
          <AnimatePresence initial={false}>
            {filtered.map((r) => (
              <motion.div
                key={r.id}
                role="button"
                tabIndex={0}
                className="myleaves-row"
                onClick={() => setDetail(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetail(r);
                  }
                }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                layout
              >
                <span data-label="Type">
                  <Badge variant={leaveVariant[r.leaveType]}>{leaveTypeShort(r.leaveType)}</Badge>
                </span>
                <span className="myleaves-period" data-label="Period">
                  <strong>{fmtDate(r.startDate)}</strong>
                  {r.startDate !== r.endDate && <> – <strong>{fmtDate(r.endDate)}</strong></>}
                  {r.isHalfDay && <em> · {r.halfDaySlot === 'MORNING' ? 'morning' : 'afternoon'} half</em>}
                  {r.timeFrom && r.timeTo && <em> · {r.timeFrom}–{r.timeTo}</em>}
                </span>
                <span className="mono" data-label="Duration">
                  {r.durationDays} {r.durationDays === 1 ? 'day' : 'days'}
                </span>
                <span data-label="Status">
                  <Badge variant={statusVariant[r.status]}>{r.status.toLowerCase()}</Badge>
                </span>
                <span className="muted" data-label="Applied">{fmtRelative(r.createdAt)}</span>
                <span className="muted" data-label="Decided">{r.reviewedAt ? fmtRelative(r.reviewedAt) : '—'}</span>
                <span data-label="Actions">
                  {r.status === 'PENDING' ? (
                    <button
                      className="myleaves-cancel"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmCancel(r.id);
                      }}
                    >
                      <XCircle size={12} /> Cancel
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <LeaveApplicationFlow open={applyOpen} onClose={() => setApplyOpen(false)} />

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
        title={detail ? `${leaveTypeLabel(detail.leaveType)} · ${fmtDate(detail.startDate)}` : ''}
        size="lg"
      >
        {detail && (
          <div className="myleaves-detail">
            <div className="myleaves-detail-row">
              <span className="myleaves-detail-label">Status</span>
              <Badge variant={statusVariant[detail.status]}>{detail.status.toLowerCase()}</Badge>
            </div>
            <div className="myleaves-detail-row">
              <span className="myleaves-detail-label">Period</span>
              <span>
                {fmtDate(detail.startDate)}
                {detail.startDate !== detail.endDate && ` — ${fmtDate(detail.endDate)}`}
                {' '}({detail.durationDays} {detail.durationDays === 1 ? 'day' : 'days'})
              </span>
            </div>
            <div className="myleaves-detail-row">
              <span className="myleaves-detail-label">Reason</span>
              <span>{detail.reason}</span>
            </div>
            {detail.description && (
              <div className="myleaves-detail-row">
                <span className="myleaves-detail-label">Description</span>
                <span>{detail.description}</span>
              </div>
            )}
            {detail.attachmentUrl && (
              <div className="myleaves-detail-row">
                <span className="myleaves-detail-label">Attachment</span>
                <a href={detail.attachmentUrl} target="_blank" rel="noopener noreferrer" className="myleaves-attach">
                  View attachment
                </a>
              </div>
            )}
            {detail.approvedAllocation && detail.approvedAllocation.length > 0 && (
              <div className="myleaves-detail-row">
                <span className="myleaves-detail-label">Approved as</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {detail.approvedAllocation.map((a) => (
                    <span key={a.date} className="mono" style={{ fontSize: 13 }}>
                      {fmtDate(a.date, 'EEE, d MMM')} — {a.slot === 'FULL' ? 'Full day' : a.slot === 'HALF_MORNING' ? 'Half (morning)' : 'Half (afternoon)'}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {detail.adminNote && (
              <div className="myleaves-detail-note">
                <MessageCircle size={14} />
                <div>
                  <strong>Note from HR</strong>
                  <p>{detail.adminNote}</p>
                </div>
              </div>
            )}
            <div className="myleaves-detail-row">
              <span className="myleaves-detail-label">Notified via</span>
              <span>{detail.channels.map((c) => (c === 'EMAIL' ? 'Email' : 'In-app')).join(' + ')}</span>
            </div>
            <div className="myleaves-detail-row">
              <span className="myleaves-detail-label">Applied</span>
              <span className="muted">{fmtDate(detail.createdAt, 'd MMM yyyy · h:mm a')}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
