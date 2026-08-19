'use client';
import { useState, useEffect, useMemo } from 'react';
import { Check, X, MessageCircle, Mail, Plus, Trash2, Pencil } from 'lucide-react';
import { avatarColorFor, initials } from '@/lib/session';
import { useApproveLeave, useLeaveDetail, useRejectLeave } from '@/lib/hooks';
import {
  defaultAllocationFor,
  computeDurationFromAllocation,
  slotLabel,
  type AllocationEntry,
  type AllocationSlot,
} from '@/lib/leave';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { Field, TextArea, TextInput } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { fmtDate, leaveTypeLabel, cx } from '../../lib/utils';
import type { LeaveType } from '../../lib/types';
import './LeaveReviewDrawer.css';

const leaveVariant: Record<LeaveType, 'casual' | 'sick' | 'replacement'> = {
  CASUAL: 'casual', SICK: 'sick', REPLACEMENT: 'replacement',
};

interface Props {
  requestId: string | null;
  onClose: () => void;
}

export function LeaveReviewDrawer({ requestId, onClose }: Props) {
  const { data: request } = useLeaveDetail(requestId);
  const approve = useApproveLeave();
  const reject = useRejectLeave();

  const [note, setNote] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [modify, setModify] = useState(false);
  const [allocation, setAllocation] = useState<AllocationEntry[]>([]);
  const [newDate, setNewDate] = useState('');

  // Initialize allocation from the request every time we open a new one
  useEffect(() => {
    if (!request) return;
    setAllocation(
      defaultAllocationFor({
        startDate: request.startDate,
        endDate: request.endDate,
        isHalfDay: request.isHalfDay,
        halfDaySlot: request.halfDaySlot,
        timeFrom: request.timeFrom,
        timeTo: request.timeTo,
      })
    );
  }, [request?.id, request]);

  useEffect(() => {
    if (!requestId) {
      setNote('');
      setRejectReason('');
      setShowApprove(false);
      setShowReject(false);
      setModify(false);
    }
  }, [requestId]);

  const finalDuration = useMemo(
    () => (modify ? computeDurationFromAllocation(allocation) : request?.durationDays ?? 0),
    [modify, allocation, request]
  );

  if (!requestId || !request) {
    return <Drawer open={!!requestId} onClose={onClose}>{null}</Drawer>;
  }

  const employee = request.employee;
  if (!employee) return null;

  const requestedDuration = request.durationDays;
  const bp = request.balancePreview;
  const currentBefore = bp
    ? (request.leaveType === 'CASUAL'
        ? bp.casualLeft
        : request.leaveType === 'SICK'
        ? bp.sickLeft
        : bp.replacementLeft)
    : 0;
  const currentAfter = currentBefore - (finalDuration - (modify ? 0 : 0));
  // For modified approvals the pending was reserved as `requestedDuration` — so
  // the "if approved" balance impact is (currentBefore + requestedDuration_pending - finalDuration).
  // Simplification below shows: "if approved, balance becomes X".
  const projected = currentBefore + (modify ? requestedDuration - finalDuration : 0) - finalDuration + (modify ? finalDuration : 0);
  void currentAfter; void projected;
  const projectedAfter = currentBefore - (finalDuration - requestedDuration);

  const empInitials = initials(employee.fullName);
  const empColor = avatarColorFor(employee.id);

  function updateSlot(idx: number, slot: AllocationSlot) {
    setAllocation((cur) => cur.map((e, i) => (i === idx ? { ...e, slot } : e)));
  }
  function removeEntry(idx: number) {
    setAllocation((cur) => cur.filter((_, i) => i !== idx));
  }
  function addEntry(date: string) {
    if (!date) return;
    if (allocation.some((e) => e.date === date)) return;
    setAllocation((cur) =>
      [...cur, { date, slot: 'FULL' as AllocationSlot }].sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    );
    setNewDate('');
  }

  const isModified =
    modify &&
    (allocation.length !== requestedDuration ||
      finalDuration !== requestedDuration ||
      allocation.some((e) => e.slot !== 'FULL'));

  return (
    <>
      <Drawer
        open={!!requestId}
        onClose={onClose}
        title={`${leaveTypeLabel(request.leaveType)} request`}
        subtitle={`Submitted ${fmtDate(request.createdAt, 'd MMM yyyy · h:mm a')}`}
      >
        <div className="lrd">
          <div className="lrd-emp">
            <Avatar initials={empInitials} color={empColor} size="lg" />
            <div>
              <div className="lrd-emp-name">{employee.fullName}</div>
              <div className="lrd-emp-role">{employee.designation ?? ''} · {employee.department ?? ''}</div>
              <div className="lrd-emp-id mono">{employee.email}</div>
            </div>
          </div>

          <div className="lrd-section">
            <div className="lrd-section-title">Requested period</div>
            <div className="lrd-period">
              <div className="lrd-period-item">
                <div className="lrd-period-label">Start</div>
                <div className="lrd-period-value">{fmtDate(request.startDate)}</div>
              </div>
              <div className="lrd-period-arrow">→</div>
              <div className="lrd-period-item">
                <div className="lrd-period-label">End</div>
                <div className="lrd-period-value">{fmtDate(request.endDate)}</div>
              </div>
              <div className="lrd-period-count">
                <Badge variant={leaveVariant[request.leaveType]}>
                  {requestedDuration} {requestedDuration === 1 ? 'day' : 'days'} requested
                </Badge>
              </div>
            </div>
            {request.timeFrom && request.timeTo && (
              <div className="lrd-desc" style={{ marginTop: 8 }}>
                Time slot: {request.timeFrom}–{request.timeTo}
              </div>
            )}
            {request.isHalfDay && (
              <div className="lrd-desc" style={{ marginTop: 8 }}>
                Half day · {request.halfDaySlot === 'MORNING' ? 'morning' : 'afternoon'}
              </div>
            )}
          </div>

          <div className="lrd-section">
            <div className="lrd-section-title">Reason</div>
            <div className="lrd-reason">{request.reason}</div>
            {request.description && <div className="lrd-desc">{request.description}</div>}
          </div>

          <div className="lrd-section">
            <div className="lrd-section-title">Notification channels</div>
            <div className="lrd-channels">
              {request.channels.includes('EMAIL') && <span><Mail size={12} /> Email</span>}
              {request.channels.includes('IN_APP') && <span><MessageCircle size={12} /> In-app</span>}
            </div>
          </div>

          {request.status === 'PENDING' && (
            <>
              <div className="lrd-section">
                <div className="lrd-section-title-row">
                  <div className="lrd-section-title">Approval allocation</div>
                  <button
                    className={cx('lrd-modify-toggle', modify && 'lrd-modify-toggle-active')}
                    onClick={() => setModify((v) => !v)}
                    type="button"
                  >
                    <Pencil size={12} />
                    {modify ? 'Cancel changes' : 'Modify'}
                  </button>
                </div>

                {!modify ? (
                  <div className="lrd-alloc-preview">
                    <p>
                      Approve as requested — <strong>{requestedDuration} day{requestedDuration === 1 ? '' : 's'}</strong>. Click <em>Modify</em> to change days to half, drop days, or extend.
                    </p>
                  </div>
                ) : (
                  <div className="lrd-alloc-editor">
                    {allocation.length === 0 && (
                      <div className="lrd-alloc-empty">
                        No days selected. Add a date below.
                      </div>
                    )}
                    {allocation.map((entry, i) => (
                      <div key={entry.date + i} className="lrd-alloc-row">
                        <span className="lrd-alloc-date">{fmtDate(entry.date, 'EEE, d MMM')}</span>
                        <select
                          className="lrd-alloc-select"
                          value={entry.slot}
                          onChange={(e) => updateSlot(i, e.target.value as AllocationSlot)}
                        >
                          <option value="FULL">{slotLabel('FULL')}</option>
                          <option value="HALF_MORNING">{slotLabel('HALF_MORNING')}</option>
                          <option value="HALF_AFTERNOON">{slotLabel('HALF_AFTERNOON')}</option>
                        </select>
                        <button
                          className="lrd-alloc-remove"
                          onClick={() => removeEntry(i)}
                          aria-label="Remove day"
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    <div className="lrd-alloc-add">
                      <TextInput
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        leadingIcon={<Plus size={14} />}
                        disabled={!newDate}
                        onClick={() => addEntry(newDate)}
                      >
                        Add day
                      </Button>
                    </div>
                  </div>
                )}

                <div className="lrd-balances">
                  <div className="lrd-balance">
                    <span>Requested</span>
                    <strong>{requestedDuration} d</strong>
                  </div>
                  <div className={cx('lrd-balance', isModified && 'lrd-balance-modified')}>
                    <span>Approving</span>
                    <strong>{finalDuration} d</strong>
                  </div>
                  <div className={cx('lrd-balance', 'lrd-balance-after', projectedAfter < 0 && 'lrd-balance-warn')}>
                    <span>Balance after</span>
                    <strong>{Math.max(0, projectedAfter)} d</strong>
                  </div>
                </div>
              </div>

              <div className="lrd-section">
                <Field label="Add a note (optional)" hint="Visible to the employee alongside your decision.">
                  <TextArea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      isModified
                        ? 'e.g. Only approving as one full + one half — team release this week.'
                        : 'e.g. Enjoy your break — coverage is confirmed.'
                    }
                    rows={3}
                  />
                </Field>
              </div>
            </>
          )}

          {request.status !== 'PENDING' && (
            <div className={cx('lrd-decided', `lrd-decided-${request.status.toLowerCase()}`)}>
              <div className="lrd-decided-title">
                {request.status === 'APPROVED' && `Approved (${requestedDuration} d)`}
                {request.status === 'REJECTED' && 'Rejected'}
                {request.status === 'CANCELLED' && 'Cancelled'}
                {request.reviewedAt && ` · ${fmtDate(request.reviewedAt, 'd MMM yyyy')}`}
              </div>
              {request.adminNote && <div className="lrd-decided-note">&quot;{request.adminNote}&quot;</div>}
            </div>
          )}
        </div>

        {request.status === 'PENDING' && (
          <div className="lrd-actions">
            <Button
              variant="secondary"
              leadingIcon={<X size={16} />}
              onClick={() => setShowReject(true)}
              className="lrd-reject"
            >
              Reject
            </Button>
            <Button
              variant="success"
              leadingIcon={<Check size={16} />}
              onClick={() => setShowApprove(true)}
              disabled={modify && finalDuration <= 0}
              fullWidth
            >
              {isModified ? `Approve (${finalDuration} d)` : 'Approve'}
            </Button>
          </div>
        )}
      </Drawer>

      <Modal
        open={showApprove}
        onClose={() => setShowApprove(false)}
        title={isModified ? 'Approve with adjustments?' : 'Approve this leave request?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowApprove(false)}>Cancel</Button>
            <Button
              variant="success"
              loading={approve.isPending}
              onClick={() => {
                approve.mutate(
                  {
                    id: request.id,
                    note: note || undefined,
                    allocation: isModified ? allocation : undefined,
                  },
                  {
                    onSuccess: () => {
                      setShowApprove(false);
                      onClose();
                    },
                  }
                );
              }}
            >
              Yes, approve
            </Button>
          </>
        }
      >
        {isModified ? (
          <>
            <p>
              You&apos;re approving <strong>{employee.fullName}&apos;s</strong>{' '}
              {leaveTypeLabel(request.leaveType).toLowerCase()} for{' '}
              <strong>{finalDuration} day{finalDuration === 1 ? '' : 's'}</strong> (originally requested {requestedDuration}).
            </p>
            <p style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              The employee will get an email showing the new allocation.
            </p>
          </>
        ) : (
          <p>
            This will deduct <strong>{requestedDuration} day{requestedDuration === 1 ? '' : 's'}</strong> from{' '}
            <strong>{employee.fullName}&apos;s</strong>{' '}{leaveTypeLabel(request.leaveType).toLowerCase()} balance. They&apos;ll be notified immediately.
          </p>
        )}
      </Modal>

      <Modal
        open={showReject}
        onClose={() => setShowReject(false)}
        title="Reject this leave request"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={rejectReason.trim().length < 4}
              loading={reject.isPending}
              onClick={() => {
                reject.mutate(
                  { id: request.id, note: rejectReason.trim() },
                  {
                    onSuccess: () => {
                      setShowReject(false);
                      setRejectReason('');
                      onClose();
                    },
                  }
                );
              }}
            >
              Reject request
            </Button>
          </>
        }
      >
        <Field label="Reason (required)" required hint="Shared with the employee so they understand the decision.">
          <TextArea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Team release week — please pick a different range."
            autoFocus
          />
        </Field>
      </Modal>
    </>
  );
}
