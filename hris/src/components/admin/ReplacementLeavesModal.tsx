'use client';
import { Coffee, Gift, User as UserIcon } from 'lucide-react';
import { useUserReplacementLeaves } from '@/lib/hooks';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { fmtDate } from '../../lib/utils';
import './ReplacementLeavesModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  employee: { id: string; fullName: string } | null;
}

const STATUS_VARIANT: Record<string, 'info' | 'success' | 'danger' | 'default'> = {
  PENDING: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'default',
};

export function ReplacementLeavesModal({ open, onClose, employee }: Props) {
  const { data, isLoading } = useUserReplacementLeaves(employee?.id ?? null, open);

  const title = employee
    ? `Replacement leaves — ${employee.fullName}`
    : 'Replacement leaves';

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {isLoading ? (
        <div className="rlm-empty muted">Loading…</div>
      ) : !data ? (
        <div className="rlm-empty muted">No data.</div>
      ) : (
        <div className="rlm">
          <div className="rlm-summary">
            <div className="rlm-summary-item">
              <span className="rlm-summary-label">Current balance</span>
              <span className="rlm-summary-value">
                {data.replacementBalance} <span className="muted">days</span>
              </span>
            </div>
            <div className="rlm-summary-item">
              <span className="rlm-summary-label">Total records</span>
              <span className="rlm-summary-value">{data.leaves.length}</span>
            </div>
            <div className="rlm-summary-item">
              <span className="rlm-summary-label">Granted directly</span>
              <span className="rlm-summary-value">
                {data.leaves.filter((l) => l.source === 'GRANTED').length}
              </span>
            </div>
          </div>

          {data.leaves.length === 0 ? (
            <div className="rlm-empty">
              <Coffee size={28} className="rlm-empty-icon" />
              <p>No replacement leaves yet for this employee.</p>
            </div>
          ) : (
            <ul className="rlm-list">
              {data.leaves.map((l) => (
                <li key={l.id} className="rlm-item">
                  <div className="rlm-item-icon">
                    {l.source === 'GRANTED' ? <Gift size={16} /> : <UserIcon size={16} />}
                  </div>
                  <div className="rlm-item-body">
                    <div className="rlm-item-top">
                      <span className="rlm-item-date">
                        {l.startDate === l.endDate
                          ? fmtDate(l.startDate, 'EEE, d MMM yyyy')
                          : `${fmtDate(l.startDate, 'd MMM')} → ${fmtDate(l.endDate, 'd MMM yyyy')}`}
                        {l.isHalfDay && l.halfDaySlot ? ` · ½ ${l.halfDaySlot === 'MORNING' ? 'AM' : 'PM'}` : ''}
                      </span>
                      <span className="rlm-item-meta">
                        <Badge variant={STATUS_VARIANT[l.status] ?? 'default'}>{l.status}</Badge>
                        <span className="mono">
                          {l.durationDays} day{l.durationDays === 1 ? '' : 's'}
                        </span>
                      </span>
                    </div>
                    <div className="rlm-item-reason">{l.reason}</div>
                    {l.description && <div className="rlm-item-desc">{l.description}</div>}
                    <div className="rlm-item-foot">
                      {l.source === 'GRANTED' && l.grantedBy && (
                        <span>Granted by <strong>{l.grantedBy.fullName}</strong></span>
                      )}
                      {l.source === 'REQUESTED' && l.reviewer && (
                        <span>Approved by <strong>{l.reviewer.fullName}</strong></span>
                      )}
                      {l.overtimeWorkDate && (
                        <span className="muted">
                          · Overtime on {fmtDate(l.overtimeWorkDate, 'd MMM yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
