'use client';
import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useAllExtraWork, useApproveExtraWork, useRejectExtraWork } from '@/lib/hooks';
import { initials, avatarColorFor } from '@/lib/session';
import { extraWorkTypeLabel, extraWorkCredit } from '@/lib/leave';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { Field, TextArea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { fmtDate, cx } from '../../lib/utils';
import './LeaveReviewDrawer.css';

interface Props {
  logId: string | null;
  onClose: () => void;
}

export function ExtraWorkReviewDrawer({ logId, onClose }: Props) {
  const { data: allLogs } = useAllExtraWork();
  const log = allLogs?.find((l) => l.id === logId);
  const approve = useApproveExtraWork();
  const reject = useRejectExtraWork();

  const [note, setNote] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!logId) {
      setNote(''); setRejectReason(''); setShowApprove(false); setShowReject(false);
    }
  }, [logId]);

  if (!logId || !log || !log.employee) {
    return <Drawer open={!!logId} onClose={onClose}>{null}</Drawer>;
  }

  const credit = extraWorkCredit(log.workType);
  const empInitials = initials(log.employee.fullName);
  const empColor = avatarColorFor(log.employee.id);

  return (
    <>
      <Drawer
        open={!!logId}
        onClose={onClose}
        title="Extra work log"
        subtitle={`Submitted ${fmtDate(log.createdAt, 'd MMM yyyy · h:mm a')}`}
      >
        <div className="lrd">
          <div className="lrd-emp">
            <Avatar initials={empInitials} color={empColor} size="lg" />
            <div>
              <div className="lrd-emp-name">{log.employee.fullName}</div>
              <div className="lrd-emp-role">{log.employee.role} · {log.employee.department ?? ''}</div>
              <div className="lrd-emp-id mono">{log.employee.email}</div>
            </div>
          </div>

          <div className="lrd-section">
            <div className="lrd-section-title">Work day</div>
            <div className="lrd-period">
              <div className="lrd-period-item">
                <div className="lrd-period-label">Date</div>
                <div className="lrd-period-value">{fmtDate(log.workDate)}</div>
              </div>
              <div className="lrd-period-item">
                <div className="lrd-period-label">Slot</div>
                <div className="lrd-period-value">{extraWorkTypeLabel(log.workType)}</div>
              </div>
              <div className="lrd-period-count">
                <Badge variant="replacement">+{credit} day{credit === 1 ? '' : 's'}</Badge>
              </div>
            </div>
          </div>

          <div className="lrd-section">
            <div className="lrd-section-title">Reason</div>
            <div className="lrd-reason">{log.reason}</div>
            {log.description && <div className="lrd-desc">{log.description}</div>}
          </div>

          {log.status === 'PENDING' && (
            <div className="lrd-section">
              <Field label="Add a note (optional)" hint="Visible to the employee alongside your decision.">
                <TextArea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Thanks for covering the demo!"
                  rows={3}
                />
              </Field>
            </div>
          )}

          {log.status !== 'PENDING' && (
            <div className={cx('lrd-decided', `lrd-decided-${log.status.toLowerCase()}`)}>
              <div className="lrd-decided-title">
                {log.status === 'APPROVED' && `Approved · +${credit} day credited`}
                {log.status === 'REJECTED' && 'Rejected'}
                {log.reviewedAt && ` · ${fmtDate(log.reviewedAt, 'd MMM yyyy')}`}
              </div>
              {log.adminNote && <div className="lrd-decided-note">&quot;{log.adminNote}&quot;</div>}
            </div>
          )}
        </div>

        {log.status === 'PENDING' && (
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
              Approve (+{credit} day)
            </Button>
          </div>
        )}
      </Drawer>

      <Modal
        open={showApprove}
        onClose={() => setShowApprove(false)}
        title="Approve this extra work log?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowApprove(false)}>Cancel</Button>
            <Button
              variant="success"
              loading={approve.isPending}
              onClick={() => {
                approve.mutate({ id: log.id, note: note || undefined }, {
                  onSuccess: () => { setShowApprove(false); onClose(); },
                });
              }}
            >
              Yes, approve
            </Button>
          </>
        }
      >
        <p>
          This will credit <strong>{credit} replacement leave day{credit === 1 ? '' : 's'}</strong> to{' '}
          <strong>{log.employee.fullName}&apos;s</strong> balance.
        </p>
      </Modal>

      <Modal
        open={showReject}
        onClose={() => setShowReject(false)}
        title="Reject this extra work log"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={rejectReason.trim().length < 4}
              loading={reject.isPending}
              onClick={() => {
                reject.mutate({ id: log.id, note: rejectReason.trim() }, {
                  onSuccess: () => { setShowReject(false); setRejectReason(''); onClose(); },
                });
              }}
            >
              Reject log
            </Button>
          </>
        }
      >
        <Field label="Reason (required)" required hint="Shared with the employee so they understand the decision.">
          <TextArea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Not eligible under company policy."
            autoFocus
          />
        </Field>
      </Modal>
    </>
  );
}
