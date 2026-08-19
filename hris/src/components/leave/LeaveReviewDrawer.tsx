'use client';
import { useState, useEffect } from 'react';
import { Check, X, MessageCircle, Mail } from 'lucide-react';
import { avatarColorFor, initials } from '@/lib/session';
import { useApproveLeave, useLeaveDetail, useRejectLeave } from '@/lib/hooks';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { Field, TextArea } from '../ui/Field';
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

  useEffect(() => {
    if (!requestId) {
      setNote('');
      setRejectReason('');
      setShowApprove(false);
      setShowReject(false);
    }
  }, [requestId]);

  if (!requestId || !request) {
    return <Drawer open={!!requestId} onClose={onClose}>{null}</Drawer>;
  }

  const employee = request.employee;
  if (!employee) return null;

  const durationDays = request.durationDays;
  const bp = request.balancePreview;
  const currentBefore = bp
    ? (request.leaveType === 'CASUAL'
        ? bp.casualLeft
        : request.leaveType === 'SICK'
        ? bp.sickLeft
        : bp.replacementLeft)
    : 0;
  const currentAfter = currentBefore - durationDays;

  const empInitials = initials(employee.fullName);
  const empColor = avatarColorFor(employee.id);

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
              <div className="lrd-emp-id mono">{request.employee?.email}</div>
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
                  {durationDays} {durationDays === 1 ? 'day' : 'days'}
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
            <div className="lrd-section-title">Balance preview</div>
            <div className="lrd-balances">
              <div className="lrd-balance">
                <span>Current balance</span>
                <strong>{currentBefore} days</strong>
              </div>
              <div className={cx('lrd-balance', 'lrd-balance-after', currentAfter < 0 && 'lrd-balance-warn')}>
                <span>If approved</span>
                <strong>{Math.max(0, currentAfter)} days</strong>
              </div>
            </div>
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
            <div className="lrd-section">
              <Field label="Add a note (optional)" hint="Visible to the employee alongside your decision.">
                <TextArea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Enjoy your break — coverage is confirmed."
                  rows={3}
                />
              </Field>
            </div>
          )}

          {request.status !== 'PENDING' && (
            <div className={cx('lrd-decided', `lrd-decided-${request.status.toLowerCase()}`)}>
              <div className="lrd-decided-title">
                {request.status === 'APPROVED' && 'Approved'}
                {request.status === 'REJECTED' && 'Rejected'}
                {request.status === 'CANCELLED' && 'Cancelled'}
                {request.reviewedAt && ` · ${fmtDate(request.reviewedAt, 'd MMM yyyy')}`}
              </div>
              {request.adminNote && <div className="lrd-decided-note">"{request.adminNote}"</div>}
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
              fullWidth
            >
              Approve
            </Button>
          </div>
        )}
      </Drawer>

      <Modal
        open={showApprove}
        onClose={() => setShowApprove(false)}
        title="Approve this leave request?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowApprove(false)}>Cancel</Button>
            <Button
              variant="success"
              loading={approve.isPending}
              onClick={() => {
                approve.mutate(
                  { id: request.id, note: note || undefined },
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
        <p>
          This will deduct <strong>{durationDays} day{durationDays === 1 ? '' : 's'}</strong> from{' '}
          <strong>{employee.fullName}&apos;s</strong>{' '}{leaveTypeLabel(request.leaveType).toLowerCase()} balance. They&apos;ll be notified immediately.
        </p>
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
