import { useMemo, useState } from 'react';
import { Search, Mail } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import './Employees.css';

export function EmployeesPage() {
  const users = useStore((s) => s.users);
  const balances = useStore((s) => s.balances);
  const [q, setQ] = useState('');

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
            u.department.toLowerCase().includes(n) ||
            u.employeeIdCode.toLowerCase().includes(n)
          );
        }),
    [users, q]
  );

  return (
    <div className="empg">
      <div className="empg-head">
        <div>
          <h1>Employees</h1>
          <p className="muted">Directory, roles and current leave balances.</p>
        </div>
      </div>

      <div className="lreq-search" style={{ maxWidth: 420 }}>
        <Search size={14} />
        <input
          placeholder="Search by name, ID, email or department…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <EmptyState title="No employees match your search" />
        </div>
      ) : (
        <div className="empg-grid">
          {filtered.map((u) => {
            const b = balances.find((x) => x.employeeId === u.id);
            const casualLeft = b ? b.casualTotal - b.casualUsed - b.casualPending : 12;
            const sickLeft = b ? b.sickTotal - b.sickUsed - b.sickPending : 12;
            return (
              <div key={u.id} className="empg-card card">
                <div className="empg-card-top">
                  <Avatar initials={u.initials} color={u.avatarColor} size="lg" />
                  <div>
                    <div className="empg-name">{u.fullName}</div>
                    <div className="empg-role">{u.designation}</div>
                    <div className="empg-dept">
                      <Badge>{u.department}</Badge>
                      {u.role === 'ADMIN' && <Badge variant="info">Admin</Badge>}
                    </div>
                  </div>
                </div>
                <div className="empg-card-body">
                  <span className="mono">{u.employeeIdCode}</span>
                  <span className="empg-mail"><Mail size={12} /> {u.email}</span>
                </div>
                <div className="empg-balances">
                  <div>
                    <span>Casual left</span>
                    <strong style={{ color: 'var(--color-leave-casual)' }}>{casualLeft}</strong>
                  </div>
                  <div>
                    <span>Sick left</span>
                    <strong style={{ color: 'var(--color-leave-sick)' }}>{sickLeft}</strong>
                  </div>
                  <div>
                    <span>Replacement</span>
                    <strong style={{ color: 'var(--color-leave-replacement)' }}>{b?.replacementBalance ?? 0}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
