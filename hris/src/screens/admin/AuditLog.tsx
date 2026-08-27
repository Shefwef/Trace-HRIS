'use client';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollText, Filter, Download, Calendar, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useAuditLog, auditLogQuery, type AuditFilters, type AuditLogItem } from '@/lib/hooks';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { avatarColorFor, initials } from '@/lib/session';
import { cx, fmtDate } from '../../lib/utils';
import './AuditLog.css';

const ACTION_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'default'> = {
  LEAVE_APPROVED: 'success',
  LEAVE_REJECTED: 'danger',
  LEAVE_CANCELLED: 'default',
  LEAVE_SUBMITTED: 'info',
  EXTRA_WORK_APPROVED: 'success',
  EXTRA_WORK_REJECTED: 'danger',
  EXTRA_WORK_SUBMITTED: 'info',
  HOLIDAY_CREATED: 'info',
  HOLIDAY_UPDATED: 'info',
  HOLIDAY_DELETED: 'danger',
  HOLIDAY_NOTICE_SENT: 'info',
  SETTINGS_UPDATED: 'warning',
  PERMISSION_UPDATED: 'warning',
  USER_INVITED: 'success',
  USER_UPDATED: 'warning',
  USER_DEACTIVATED: 'danger',
  USER_REACTIVATED: 'success',
  CLOCK_IN: 'default',
  CLOCK_OUT: 'default',
  WORK_LOCATION_OFFSITE_STARTED: 'warning',
  WORK_LOCATION_RETURNED: 'success',
  WORK_LOCATION_CHANGED: 'info',
  WORK_LOCATION_CORRECTION: 'warning',
};

/** Absolute time formatter — "27 Aug 2026 · 14:32:07" — always shown, no "3 mins ago". */
function fmtAbsoluteTime(iso: string): string {
  return fmtDate(iso, 'd MMM yyyy · HH:mm:ss');
}

export function AuditLog() {
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filters: AuditFilters = useMemo(() => ({
    action: action || undefined,
    actorId: actorId || undefined,
    targetUserId: targetUserId || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
  }), [action, actorId, targetUserId, from, to]);

  const { data, isLoading } = useAuditLog(filters);

  const clearFilters = () => {
    setAction(''); setActorId(''); setTargetUserId(''); setFrom(''); setTo('');
  };
  const anyFilterActive = !!(action || actorId || targetUserId || from || to);

  const exportUrl = `/api/audit-log/export${auditLogQuery(filters)}`;

  return (
    <div className="audlog">
      <div className="audlog-head">
        <div>
          <h1>Audit log</h1>
          <p className="muted">
            Every state-changing action in the system. Immutable, timestamped, and exportable.
          </p>
        </div>
        <a href={exportUrl} download className="audlog-export-btn">
          <Download size={14} /> Export Excel
        </a>
      </div>

      <div className="audlog-filters">
        <div className="audlog-filter">
          <label>User (actor)</label>
          <select value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">Anyone</option>
            {(data?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.fullName} · {u.role}</option>
            ))}
          </select>
        </div>
        <div className="audlog-filter">
          <label>Target user</label>
          <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
            <option value="">Anyone</option>
            {(data?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.fullName} · {u.role}</option>
            ))}
          </select>
        </div>
        <div className="audlog-filter">
          <label>Action</label>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {(data?.actions ?? []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="audlog-filter">
          <label>From</label>
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="audlog-filter">
          <label>To</label>
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {anyFilterActive && (
          <button className="audlog-clear" onClick={clearFilters}>
            <X size={12} /> Clear
          </button>
        )}
        <div className="audlog-count">
          <Filter size={13} />
          <strong>{data?.items.length ?? 0}</strong> of last {data?.limit ?? 200}
        </div>
      </div>

      {isLoading && <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Loading audit log…</div>}

      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <div className="card audlog-empty">
          <ScrollText size={28} style={{ marginBottom: 12, color: 'var(--color-text-muted)' }} />
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>No entries match these filters</div>
          {anyFilterActive && <button className="audlog-clear" onClick={clearFilters} style={{ marginTop: 12 }}>Clear filters</button>}
        </div>
      )}

      {!isLoading && (data?.items.length ?? 0) > 0 && (
        <div className="audlog-table card">
          <div className="audlog-thead">
            <span></span>
            <span>User</span>
            <span>Action</span>
            <span>Target user</span>
            <span>Details</span>
            <span>Time</span>
          </div>
          <AnimatePresence initial={false}>
            {(data?.items ?? []).map((entry) => (
              <AuditRow
                key={entry.id}
                entry={entry}
                expanded={expanded === entry.id}
                onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function AuditRow({ entry, expanded, onToggle }: {
  entry: AuditLogItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const variant = ACTION_VARIANT[entry.action] ?? 'default';
  const actorName = entry.actor?.fullName ?? 'System';
  const targetName = entry.targetUser?.fullName ?? (entry.actor?.id === entry.targetUser?.id ? '—' : '—');
  const isSelfAction = entry.targetUser && entry.actor?.id === entry.targetUser?.id;

  return (
    <motion.div
      className={cx('audlog-row', expanded && 'audlog-row-open')}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      layout
    >
      <button className="audlog-row-toggle" onClick={onToggle} aria-expanded={expanded}>
        <div className="audlog-cell audlog-cell-chev">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="audlog-cell audlog-cell-user" data-label="User">
          {entry.actor ? (
            <>
              <Avatar
                initials={initials(entry.actor.fullName)}
                color={avatarColorFor(entry.actor.id)}
                size="sm"
              />
              <div className="audlog-user-text">
                <div className="audlog-user-name">{actorName}</div>
                <div className="audlog-user-role">{entry.actor.role}</div>
              </div>
            </>
          ) : (
            <span className="audlog-system"><ScrollText size={14} /> System</span>
          )}
        </div>
        <div className="audlog-cell audlog-cell-action" data-label="Action">
          <Badge variant={variant}>{entry.action.toLowerCase().replace(/_/g, ' ')}</Badge>
        </div>
        <div className="audlog-cell audlog-cell-target" data-label="Target user">
          {entry.targetUser ? (
            <>
              <Avatar
                initials={initials(entry.targetUser.fullName)}
                color={avatarColorFor(entry.targetUser.id)}
                size="sm"
              />
              <div className="audlog-user-text">
                <div className="audlog-user-name">
                  {entry.targetUser.fullName}
                  {isSelfAction && <span className="audlog-self-tag">self</span>}
                </div>
                <div className="audlog-user-role">{entry.targetUser.role}</div>
              </div>
            </>
          ) : (
            <span className="audlog-dash">—</span>
          )}
        </div>
        <div className="audlog-cell audlog-cell-detail" data-label="Details">
          {entry.detail}
        </div>
        <div className="audlog-cell audlog-cell-time" data-label="Time">
          <Calendar size={11} /> <span className="mono">{fmtAbsoluteTime(entry.createdAt)}</span>
        </div>
      </button>

      {expanded && (
        <div className="audlog-details">
          <div className="audlog-detail-grid">
            {entry.targetType && (
              <div><span className="audlog-detail-label">Target type:</span> <span className="mono">{entry.targetType}</span></div>
            )}
            {entry.targetId && (
              <div><span className="audlog-detail-label">Target ID:</span> <span className="mono">{entry.targetId}</span></div>
            )}
            {entry.ip && (
              <div><span className="audlog-detail-label">IP:</span> <span className="mono">{entry.ip}</span></div>
            )}
          </div>
          {entry.metadata !== null && entry.metadata !== undefined && (
            <div className="audlog-detail-block">
              <div className="audlog-detail-label">Raw metadata</div>
              <pre className="audlog-json">{JSON.stringify(entry.metadata, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
