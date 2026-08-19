'use client';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollText, Filter, Calendar } from 'lucide-react';
import { useAuditLog } from '@/lib/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Field, TextInput } from '../../components/ui/Field';
import { avatarColorFor, initials } from '@/lib/session';
import { cx, fmtDate, fmtRelative } from '../../lib/utils';
import './AuditLog.css';

const ACTION_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'default'> = {
  LEAVE_APPROVED: 'success',
  LEAVE_REJECTED: 'danger',
  LEAVE_CANCELLED: 'default',
  EXTRA_WORK_APPROVED: 'success',
  EXTRA_WORK_REJECTED: 'danger',
  HOLIDAY_CREATED: 'info',
  HOLIDAY_UPDATED: 'info',
  HOLIDAY_DELETED: 'danger',
  HOLIDAY_NOTICE_SENT: 'info',
  SETTINGS_UPDATED: 'warning',
  USER_INVITED: 'success',
  USER_UPDATED: 'warning',
  CLOCK_IN: 'default',
  CLOCK_OUT: 'default',
};

export function AuditLog() {
  const [action, setAction] = useState('');
  const [since, setSince] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ action: action || undefined, since: since || undefined }),
    [action, since]
  );

  const { data, isLoading } = useAuditLog(filters);

  return (
    <div className="audlog">
      <div className="audlog-head">
        <div>
          <h1>Audit log</h1>
          <p className="muted">
            Every state-changing action in the system. Super-Admin only. Immutable.
          </p>
        </div>
      </div>

      <div className="audlog-filters">
        <Field label="Action">
          <select
            className="input"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">All actions</option>
            {(data?.actions ?? []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Since">
          <TextInput type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        </Field>
        <div className="audlog-count">
          <Filter size={14} />
          Showing <strong>{data?.items.length ?? 0}</strong> of last {data?.limit ?? 100} entries
        </div>
      </div>

      {isLoading && <div className="muted">Loading audit log…</div>}

      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <ScrollText size={28} style={{ marginBottom: 12 }} />
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>No entries match these filters</div>
        </div>
      )}

      <div className="audlog-list">
        <AnimatePresence initial={false}>
          {(data?.items ?? []).map((entry) => {
            const variant = ACTION_VARIANT[entry.action] ?? 'default';
            const isOpen = expanded === entry.id;
            const actorName = entry.actor?.fullName ?? 'System';
            return (
              <motion.button
                key={entry.id}
                className={cx('audlog-row', isOpen && 'audlog-row-open')}
                onClick={() => setExpanded(isOpen ? null : entry.id)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                layout
              >
                <div className="audlog-row-head">
                  <div className="audlog-actor">
                    {entry.actor ? (
                      <Avatar
                        initials={initials(entry.actor.fullName)}
                        color={avatarColorFor(entry.actor.id)}
                        size="sm"
                      />
                    ) : (
                      <span className="audlog-system" title="System action">
                        <ScrollText size={14} />
                      </span>
                    )}
                    <div>
                      <div className="audlog-actor-name">{actorName}</div>
                      <div className="audlog-actor-meta">
                        {entry.actor?.email ?? 'server'}
                      </div>
                    </div>
                  </div>
                  <Badge variant={variant}>{entry.action.toLowerCase().replace(/_/g, ' ')}</Badge>
                  <div className="audlog-target muted">
                    {entry.targetType ?? '—'}
                    {entry.targetId && <span className="mono"> · {entry.targetId.slice(0, 8)}</span>}
                  </div>
                  <div className="audlog-time muted" title={fmtDate(entry.createdAt, 'd MMM yyyy · HH:mm:ss')}>
                    <Calendar size={11} /> {fmtRelative(entry.createdAt)}
                  </div>
                </div>
                {isOpen && (
                  <div className="audlog-details">
                    {entry.metadata !== null && entry.metadata !== undefined && (
                      <div className="audlog-detail-block">
                        <div className="audlog-detail-label">Metadata</div>
                        <pre className="audlog-json">{JSON.stringify(entry.metadata, null, 2)}</pre>
                      </div>
                    )}
                    <div className="audlog-detail-inline">
                      {entry.ip && <span><strong>IP:</strong> <span className="mono">{entry.ip}</span></span>}
                      {entry.userAgent && (
                        <span title={entry.userAgent}>
                          <strong>User agent:</strong> {entry.userAgent.slice(0, 60)}
                          {entry.userAgent.length > 60 && '…'}
                        </span>
                      )}
                      <span><strong>Exact time:</strong> <span className="mono">{fmtDate(entry.createdAt, 'd MMM yyyy · HH:mm:ss')}</span></span>
                    </div>
                  </div>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
