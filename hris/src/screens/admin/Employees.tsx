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

const ROLE_BADGE_VARIANT: Record<AppRole, 'info' | 'replacement' | 'success' | 'default'> = {
  SUPER_ADMIN: 'success',
  ADMIN: 'info',
  HR: 'replacement',
  EMPLOYEE: 'default',
};

/** Union of two role sets, preserving hierarchy order. */
function toggleRole(current: AppRole[], role: AppRole): AppRole[] {
  return current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
}

export function EmployeesPage() {
  const currentUser = useCurrentUser();
  const { data: users = [], isLoading } = useUsers();
  const updateEmployee = useUpdateEmployee();
  const addToast = useStore((s) => s.addToast);
  const [q, setQ] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [rolesEditId, setRolesEditId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<AppRole[]>([]);

  const rolesEditUser = rolesEditId ? users.find((u) => u.id === rolesEditId) : null;

  const canAssign = assignableRoles(currentUser?.role);
  const canEditRoles = canAssign.length > 0;

  const filtered = useMemo(
    () =>
      users
        // Hide the actor from their own list; you can't edit yourself here.
        .filter((u) => u.id !== currentUser?.id)
        // HR shouldn't be able to see (or accidentally edit) SUPER_ADMIN rows.
        .filter((u) => !(currentUser?.role === 'HR' && (u.roles ?? [u.role]).includes('SUPER_ADMIN')))
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

  function updateRoles(id: string, nextRoles: AppRole[]) {
    if (nextRoles.length === 0) {
      addToast({
        kind: 'error',
        title: 'At least one role required',
        body: 'A user must have at least one role. Add another before removing this one.',
      });
      return;
    }
    updateEmployee.mutate(
      { id, patch: { roles: nextRoles } },
      {
        onSuccess: () =>
          addToast({
            kind: 'success',
            title: 'Roles updated',
            body: nextRoles.map((r) => ROLE_LABEL[r]).join(' · '),
          }),
        onError: (e: Error) =>
          addToast({ kind: 'error', title: 'Could not update roles', body: e.message }),
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
            const currentRoles = ((u.roles?.length ? u.roles : [u.role]) as AppRole[]);
            return (
              <div key={u.id} className="empg-card card">
                <div className="empg-card-top">
                  <Avatar
                    initials={initials(u.fullName)}
                    color={avatarColorFor(u.id)}
                    size="lg"
                    imageUrl={u.avatarUrl}
                    alt={u.fullName}
                  />
                  <div>
                    <div className="empg-name">{u.fullName}</div>
                    <div className="empg-role">{u.designation}</div>
                    <div className="empg-dept">
                      {u.department && <Badge>{u.department}</Badge>}
                      {currentRoles.map((r) => (
                        <Badge key={r} variant={ROLE_BADGE_VARIANT[r]}>
                          {ROLE_LABEL[r]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="empg-card-body">
                  <span className="mono">{u.employeeIdCode ?? '—'}</span>
                  <span className="empg-mail"><Mail size={12} /> {u.email}</span>
                </div>
                <div className="empg-card-actions">
                  {canEditRoles && (
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<ShieldCheck size={12} />}
                      onClick={() => {
                        setRolesEditId(u.id);
                        setPendingRoles(currentRoles);
                      }}
                    >
                      Manage roles
                    </Button>
                  )}
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

      <Modal
        open={!!rolesEditId}
        onClose={() => setRolesEditId(null)}
        title={rolesEditUser ? `Manage roles - ${rolesEditUser.fullName}` : 'Manage roles'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRolesEditId(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={updateEmployee.isPending}
              disabled={pendingRoles.length === 0}
              onClick={() => {
                if (!rolesEditId) return;
                updateRoles(rolesEditId, pendingRoles);
                setRolesEditId(null);
              }}
            >
              Save roles
            </Button>
          </>
        }
      >
        <p className="empg-modal-desc">
          A person can hold more than one role at once. You must keep at least one role granted.
        </p>
        <div className="empg-modal-roles">
          {(['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE'] as AppRole[]).map((r) => {
            const checked = pendingRoles.includes(r);
            const locked = !canAssign.includes(r);
            return (
              <label
                key={r}
                className={`empg-role-check ${checked ? 'is-checked' : ''} ${locked ? 'is-locked' : ''}`}
                title={locked ? 'You are not allowed to grant or revoke this role.' : undefined}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => setPendingRoles(toggleRole(pendingRoles, r))}
                />
                <span>{ROLE_LABEL[r]}</span>
              </label>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
