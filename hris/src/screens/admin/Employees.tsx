'use client';
import { useMemo, useState } from 'react';
import { Search, Mail, UserPlus, UserX, ShieldCheck } from 'lucide-react';
import { useUsers, useUpdateEmployee } from '@/lib/hooks';
import { initials, avatarColorFor, useCurrentUser } from '@/lib/session';
import { useStore } from '@/lib/store';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { InviteEmployeeModal } from '../../components/admin/InviteEmployeeModal';
import './Employees.css';

type AppRole = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE';

/**
 * Which roles the current actor is allowed to assign.
 *   SUPER_ADMIN / ADMIN → all four roles.
 *   HR                  → HR + EMPLOYEE only.
 *   EMPLOYEE            → nothing (this page is HR+ only anyway).
 */
function assignableRoles(actorRole: string | undefined): AppRole[] {
  if (actorRole === 'SUPER_ADMIN' || actorRole === 'ADMIN')
    return ['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE'];
  if (actorRole === 'HR') return ['HR', 'EMPLOYEE'];
  return [];
}

const ROLE_LABEL: Record<AppRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  EMPLOYEE: 'Employee',
};

export function EmployeesPage() {
  const currentUser = useCurrentUser();
  const { data: users = [], isLoading } = useUsers();
  const updateEmployee = useUpdateEmployee();
  const addToast = useStore((s) => s.addToast);
  const [q, setQ] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const canAssign = assignableRoles(currentUser?.role);
  const canEditRoles = canAssign.length > 0;

  const filtered = useMemo(
    () =>
      users
        // Hide the actor from their own list; you can't edit yourself here.
        .filter((u) => u.id !== currentUser?.id)
        // HR shouldn't be able to see (or accidentally edit) SUPER_ADMIN rows.
        .filter((u) => !(currentUser?.role === 'HR' && u.role === 'SUPER_ADMIN'))
        .filter((u) => {
          if (!q.trim()) return true;
          const n = q.trim().toLowerCase();
          return (
            u.fullName.toLowerCase().includes(n) ||
            u.email.toLowerCase().includes(n) ||
            (u.department ?? '').toLowerCase().includes(n) ||
            (u.employeeIdCode ?? '').toLowerCase().includes(n)
          );
        }),
    [users, q, currentUser]
  );

  function changeRole(id: string, next: AppRole) {
    updateEmployee.mutate(
      { id, patch: { role: next } },
      {
        onSuccess: () =>
          addToast({ kind: 'success', title: 'Role updated', body: `Set to ${ROLE_LABEL[next]}` }),
        onError: (e: Error) =>
          addToast({ kind: 'error', title: 'Could not update role', body: e.message }),
      },
    );
  }

  return (
    <div className="empg">
      <div className="empg-head">
        <div>
          <h1>Employees</h1>
          <p className="muted">Directory, roles and current status.</p>
        </div>
        <Button variant="primary" leadingIcon={<UserPlus size={16} />} onClick={() => setInviteOpen(true)}>
          Invite employee
        </Button>
      </div>

      <div className="empg-search">
        <Search size={16} className="empg-search-icon" />
        <input
          className="empg-search-input"
          placeholder="Search by name, employee ID, email, or department"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search employees"
        />
        {q && (
          <button
            type="button"
            className="empg-search-clear"
            onClick={() => setQ('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {isLoading && <div className="muted">Loading employees…</div>}

      {!isLoading && filtered.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <EmptyState
            title="No employees match your search"
            action={
              <Button variant="primary" leadingIcon={<UserPlus size={16} />} onClick={() => setInviteOpen(true)}>
                Invite employee
              </Button>
            }
          />
        </div>
      ) : (
        <div className="empg-grid">
          {filtered.map((u) => {
            const badgeVariant = u.role === 'ADMIN' ? 'info' : u.role === 'HR' ? 'replacement' : 'default';
            return (
              <div key={u.id} className="empg-card card">
                <div className="empg-card-top">
                  <Avatar initials={initials(u.fullName)} color={avatarColorFor(u.id)} size="lg" />
                  <div>
                    <div className="empg-name">{u.fullName}</div>
                    <div className="empg-role">{u.designation}</div>
                    <div className="empg-dept">
                      {u.department && <Badge>{u.department}</Badge>}
                      <Badge variant={badgeVariant}>{u.role.toLowerCase()}</Badge>
                    </div>
                  </div>
                </div>
                <div className="empg-card-body">
                  <span className="mono">{u.employeeIdCode ?? '—'}</span>
                  <span className="empg-mail"><Mail size={12} /> {u.email}</span>
                </div>
                {canEditRoles && (
                  <div className="empg-card-role">
                    <label>
                      <ShieldCheck size={12} />
                      Role
                    </label>
                    <select
                      value={u.role}
                      disabled={updateEmployee.isPending}
                      onChange={(e) => {
                        const next = e.target.value as AppRole;
                        if (next === u.role) return;
                        changeRole(u.id, next);
                      }}
                    >
                      {(() => {
                        // Always include the user's current role, even if the
                        // actor couldn't newly assign it — so the dropdown
                        // shows the true current state.
                        const opts = Array.from(new Set([u.role as AppRole, ...canAssign]));
                        return opts.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                )}
                <div className="empg-card-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={<UserX size={12} />}
                    onClick={() => setDeactivateId(u.id)}
                  >
                    Deactivate
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <InviteEmployeeModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <Modal
        open={!!deactivateId}
        onClose={() => setDeactivateId(null)}
        title="Deactivate this employee?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeactivateId(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={updateEmployee.isPending}
              onClick={() => {
                if (!deactivateId) return;
                updateEmployee.mutate(
                  { id: deactivateId, patch: { isActive: false } },
                  { onSuccess: () => setDeactivateId(null) }
                );
              }}
            >
              Deactivate
            </Button>
          </>
        }
      >
        <p>
          The user will no longer be able to sign in and won&apos;t appear in approval routing.
          Their history and audit trail remain intact. You can reactivate them from the same
          record later.
        </p>
      </Modal>
    </div>
  );
}
