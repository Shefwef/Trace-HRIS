'use client';
import { useMemo, useState } from 'react';
import { Search, Mail, UserPlus, UserX } from 'lucide-react';
import { useUsers, useUpdateEmployee } from '@/lib/hooks';
import { initials, avatarColorFor } from '@/lib/session';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { InviteEmployeeModal } from '../../components/admin/InviteEmployeeModal';
import './Employees.css';

export function EmployeesPage() {
  const { data: users = [], isLoading } = useUsers();
  const updateEmployee = useUpdateEmployee();
  const [q, setQ] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      users
        .filter((u) => u.role !== 'SUPER_ADMIN')
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
    [users, q]
  );

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

      <div className="lreq-search" style={{ maxWidth: 420 }}>
        <Search size={14} />
        <input
          placeholder="Search by name, ID, email or department…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
