import { useState } from 'react';
import { Check, X, Paperclip, MessageCircle, Mail } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { Field, TextArea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { fmtDate, leaveTypeLabel, cx } from '../../lib/utils';
import type { LeaveRequest, LeaveType } from '../../lib/types';
import './LeaveReviewDrawer.css';

const leaveVariant: Record<LeaveType, 'casual' | 'sick' | 'replacement'> = {
  CASUAL: 'casual', SICK: 'sick', REPLACEMENT: 'replacement',
};

interface Props {
  request: LeaveRequest | null;
  onClose: () => void;
}

export function LeaveReviewDrawer({ request, onClose }: Props) {
  const users = useStore((s) => s.users);
  const balances = useStore((s) => s.balances);
  const approve = useStore((s) => s.approveLeave);
  const reject = useStore((s) => s.rejectLeave);

  const [note, setNote] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (!request) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;

  const employee = users.find((u) => u.id === request.employeeId);
  const balance = balances.find((b) => b.employeeId === request.employeeId);
  if (!employee || !balance) return null;

  const balanceMap: Record<LeaveType, [number, number]> = {
    CASUAL: [
      balance.casualTotal - balance.casualUsed - balance.casualPending,
      balance.casualTotal - balance.casualUsed - balance.casualPending - request.durationDays,
    ],
    SICK: [
      balance.sickTotal - balance.sickUsed - balance.sickPending,
      balance.sickTotal - balance.sickUsed - balance.sickPending - request.durationDays,
    ],
    REPLACEMENT: [
      balance.replacementBalance,
      balance.replacementBalance - request.durationDays,
    ],
  };
  const [before, after] = balanceMap[request.leaveType];

  return (
    <>
      <Drawer
        open={!!request}
        onClose={onClose}
        title={`${leaveTypeLabel(request.leaveType)} request`}
        subtitle={`Submitted ${fmtDate(request.createdAt, 'd MMM yyyy · h:mm a')}`}
      >
        <div className="lrd">
          <div className="lrd-emp">
            <Avatar initials={employee.initials} color={employee.avatarColor} size="lg" />
            <div>
              <div className="lrd-emp-name">{employee.fullName}</div>
              <div className="lrd-emp-role">{employee.designation} · {employee.department}</div>
              <div className="lrd-emp-id mono">{employee.employeeIdCode}</div>
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
                <Badge variant={leaveVariant[request.leaveType]}>{request.durationDays} {request.durationDays === 1 ? 'day' : 'days'}</Badge>
              </div>
            </div>
          </div>

          <div className="lrd-section">
            <div className="lrd-section-title">Balance preview</div>
            <div className="lrd-balances">
              <div className="lrd-balance">
                <span>Current balance</span>
                <strong>{before} days</strong>
              </div>
              <div className={cx('lrd-balance', 'lrd-balance-after', after < 0 && 'lrd-balance-warn')}>
                <span>If approved</span>
                <strong>{Math.max(0, after)} days</strong>
              </div>
            </div>
          </div>

          <div className="lrd-section">
            <div className="lrd-section-title">Reason</div>
            <div className="lrd-reason">{request.reason}</div>
            {request.description && (
              <div className="lrd-desc">{request.description}</div>
            )}
            {request.attachmentName && (
              <div className="lrd-attach">
                <Paperclip size={14} /> {request.attachmentName}
              </div>
            )}
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
              onClick={() => {
                approve(request.id, note || undefined);
                setShowApprove(false);
                onClose();
              }}
            >
              Yes, approve
            </Button>
          </>
        }
      >
        <p>
          This will deduct <strong>{request.durationDays} day{request.durationDays === 1 ? '' : 's'}</strong> from{' '}
          <strong>{employee.fullName}'s</strong>{' '}{leaveTypeLabel(request.leaveType).toLowerCase()} balance. They'll be notified immediately.
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
              onClick={() => {
                reject(request.id, rejectReason.trim());
                setShowReject(false);
                setRejectReason('');
                onClose();
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
