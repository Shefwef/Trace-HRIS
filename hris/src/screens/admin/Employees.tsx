'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Users } from 'lucide-react';
import { useUsers } from '@/lib/hooks';
import { initials, avatarColorFor, useCurrentUser } from '@/lib/session';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { InviteEmployeeModal } from '../../components/admin/InviteEmployeeModal';
import { cx } from '../../lib/utils';
import './Employees.css';

type Tab = 'ACTIVE' | 'DEACTIVATED' | 'DELETED';

export function EmployeesPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [tab, setTab] = useState<Tab>('ACTIVE');
  const [q, setQ] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  // Load the right slice based on the selected tab.
  const { data: activeUsers = [], isLoading: activeLoading } = useUsers();                          // active only
  const { data: allUsers = [], isLoading: allLoading }       = useUsers({ includeDeactivated: true }); // active + deactivated
  const { data: deletedUsers = [], isLoading: deletedLoading } = useUsers({ deleted: true });        // deleted only

  const list = tab === 'ACTIVE' ? activeUsers
             : tab === 'DELETED' ? deletedUsers
             : allUsers.filter((u) => !u.isActive);
  const isLoading = tab === 'ACTIVE' ? activeLoading : tab === 'DELETED' ? deletedLoading : allLoading;

  const filtered = useMemo(() => {
    if (!q.trim()) return list;
    const needle = q.trim().toLowerCase();
    return list.filter(
      (u) =>
        u.fullName.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        (u.department ?? '').toLowerCase().includes(needle) ||
        (u.employeeIdCode ?? '').toLowerCase().includes(needle),
    );
  }, [list, q]);

  const actorRoles = currentUser?.roles?.length ? currentUser.roles : currentUser ? [currentUser.role] : [];
  const canInvite = actorRoles.includes('ADMIN') || actorRoles.includes('HR') || actorRoles.includes('SUPER_ADMIN');

  const activeCount     = activeUsers.length;
  const deactivatedCount = allUsers.filter((u) => !u.isActive).length;
  const deletedCount    = deletedUsers.length;

  return (
    <div className="emp">
      <div className="emp-head">
        <div>
          <h1><Users size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />Employees</h1>
          <p className="muted">Manage the team. Click any card to open the full profile.</p>
        </div>
        {canInvite && (
          <Button variant="primary" leadingIcon={<UserPlus size={16} />} onClick={() => setInviteOpen(true)}>
            Invite employee
          </Button>
        )}
      </div>

      {/* Tabs + Search row */}
      <div className="emp-toolbar">
        <div className="emp-tabs">
          <TabBtn active={tab === 'ACTIVE'}      onClick={() => setTab('ACTIVE')}      label="Active"       count={activeCount} />
          <TabBtn active={tab === 'DEACTIVATED'} onClick={() => setTab('DEACTIVATED')} label="Deactivated"  count={deactivatedCount} />
          <TabBtn active={tab === 'DELETED'}     onClick={() => setTab('DELETED')}     label="Deleted"      count={deletedCount} tone="danger" />
        </div>
        <div className="emp-search">
          <Search size={14} />
          <input
            placeholder="Search name, email, ID or department…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {tab === 'DELETED' && (
        <div className="emp-info-banner">
          Deleted employees stay here for 60 days, then are permanently removed automatically. Open a profile to restore or delete forever.
        </div>
      )}

      {isLoading ? (
        <div className="emp-loading">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <EmptyState
            title={q ? 'No matches' : tab === 'DELETED' ? 'Deleted bin is empty' : tab === 'DEACTIVATED' ? 'No deactivated accounts' : 'No employees yet'}
            body={q ? 'Try a different search.' : tab === 'ACTIVE' ? 'Invite your first employee to get started.' : undefined}
          />
        </div>
      ) : (
        <ol className="emp-grid">
          {filtered.map((u, idx) => {
            const status: Tab = u.deletedAt ? 'DELETED' : u.isActive ? 'ACTIVE' : 'DEACTIVATED';
            return (
              <li key={u.id}>
                <div
                  className={cx('emp-card', status !== 'ACTIVE' && 'emp-card-faded', status === 'DELETED' && 'emp-card-deleted')}
                >
                  <span className="emp-serial mono">{idx + 1}</span>
                  <Avatar
                    initials={initials(u.fullName)}
                    color={avatarColorFor(u.id)}
                    size="lg"
                    imageUrl={u.avatarUrl}
                    alt={u.fullName}
                  />
                  <div className="emp-card-body">
                    <div className="emp-card-name">{u.fullName}</div>
                    <div className="emp-card-meta">
                      {u.designation ?? <em className="muted">No designation</em>}
                    </div>
                    <div className="emp-card-id mono">
                      ID: {u.employeeIdCode ?? '—'}
                      {u.department && <span className="emp-dot"> · {u.department}</span>}
                    </div>
                  </div>
                  <div className="emp-card-actions">
                    <button
                      type="button"
                      className="emp-details-btn"
                      onClick={() => router.push(`/admin/employees/${u.id}`)}
                    >
                      Details
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <InviteEmployeeModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

function TabBtn({ active, onClick, label, count, tone }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('emp-tab', active && 'emp-tab-active', tone === 'danger' && 'emp-tab-danger')}
    >
      {label}
      <span className="emp-tab-count">{count}</span>
    </button>
  );
}
