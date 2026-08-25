'use client';

import { useState, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, RotateCcw } from 'lucide-react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PERMISSION_GROUPS, PERMISSION_LABELS, DEFAULT_MATRIX } from '@/lib/permissions';
import { cx } from '@/lib/utils';
import type { Role } from '@prisma/client';
import './PermissionsMatrix.css';

type RolePermission = { id: string; role: Role; permission: string; enabled: boolean };

const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'];
const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  LINE_MANAGER: 'Line Manager',
  EMPLOYEE: 'Employee',
};

export function PermissionsMatrix() {
  const qc = useQueryClient();
  const addToast = useStore((s) => s.addToast);
  const [resetOpen, setResetOpen] = useState(false);

  const { data: dbPerms = [], isLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api<RolePermission[]>('/api/permissions'),
  });

  const toggleMutation = useMutation({
    mutationFn: (args: { role: Role; permission: string; enabled: boolean }) =>
      api('/api/permissions', { method: 'PATCH', body: JSON.stringify(args) }),
    onMutate: async (newPerm) => {
      await qc.cancelQueries({ queryKey: ['permissions'] });
      const prev = qc.getQueryData<RolePermission[]>(['permissions']);
      qc.setQueryData<RolePermission[]>(['permissions'], (old) => {
        if (!old) return old;
        const existing = old.find((p) => p.role === newPerm.role && p.permission === newPerm.permission);
        if (existing) {
          return old.map((p) => (p === existing ? { ...p, enabled: newPerm.enabled } : p));
        }
        return [...old, { id: 'temp', ...newPerm }];
      });
      return { prev };
    },
    onError: (err, newPerm, context) => {
      if (context?.prev) qc.setQueryData(['permissions'], context.prev);
      addToast({ kind: 'error', title: 'Failed to update permission', body: err.message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['permissions'] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api('/api/permissions/reset', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions'] });
      addToast({ kind: 'success', title: 'Permissions reset to defaults' });
      setResetOpen(false);
    },
    onError: (err) => {
      addToast({ kind: 'error', title: 'Reset failed', body: err.message });
    },
  });

  // Create a fast lookup map: key is "ROLE:permission"
  const permMap = useMemo(() => {
    const map = new Map<string, boolean>();
    dbPerms.forEach((p) => map.set(`${p.role}:${p.permission}`, p.enabled));
    return map;
  }, [dbPerms]);

  // Super Admin is deliberately immutable: every permission stays on, so the
  // owner can never lock themselves out of the system from this screen.
  function isLocked(role: Role) {
    return role === 'SUPER_ADMIN';
  }

  function handleToggle(role: Role, permission: string, currentVal: boolean) {
    if (isLocked(role)) {
      addToast({ kind: 'error', title: 'Super Admin permissions cannot be changed' });
      return;
    }
    toggleMutation.mutate({ role, permission, enabled: !currentVal });
  }

  return (
    <div className="perm-matrix">
      <div className="perm-matrix-head">
        <div>
          <h1>Permission Matrix</h1>
          <p className="muted">Configure what each role is allowed to do across the system.</p>
        </div>
        <Button variant="danger" leadingIcon={<RotateCcw size={16} />} onClick={() => setResetOpen(true)}>
          Reset Defaults
        </Button>
      </div>

      {isLoading ? (
        <div className="muted">Loading permissions...</div>
      ) : (
        <div className="perm-grid-wrapper card">
          <table className="perm-table">
            <thead>
              <tr>
                <th className="perm-col-label">Permission</th>
                {ROLES.map((role) => (
                  <th key={role} className="perm-col-role">{ROLE_LABELS[role]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                <Fragment key={group.label}>
                  <tr className="perm-group-header">
                    <td colSpan={ROLES.length + 1}>{group.label}</td>
                  </tr>
                  {group.permissions.map((permKey) => (
                    <tr key={permKey} className="perm-row">
                      <td className="perm-cell-label">{PERMISSION_LABELS[permKey] || permKey}</td>
                      {ROLES.map((role) => {
                        // Mirror the server-side resolution order in checkPermission():
                        // a stored row wins, otherwise fall back to the compiled default.
                        // Without the fallback the whole grid reads as unchecked until
                        // sync-roles (or Reset Defaults) has populated role_permissions.
                        const stored = permMap.get(`${role}:${permKey}`);
                        const enabled = stored ?? DEFAULT_MATRIX[role]?.[permKey] ?? false;
                        const locked = isLocked(role);
                        return (
                          <td key={role} className="perm-cell-check">
                            <label className={cx('perm-toggle', enabled && 'is-on', locked && 'is-locked')}>
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={locked || toggleMutation.isPending}
                                onChange={() => handleToggle(role, permKey, enabled)}
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset to default permissions?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={resetMutation.isPending}
              onClick={() => resetMutation.mutate()}
            >
              Reset to defaults
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <ShieldAlert size={24} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
          <p>
            This will wipe all custom permission changes and restore the system matrix to its factory defaults.
            This action cannot be undone. Are you sure?
          </p>
        </div>
      </Modal>
    </div>
  );
}
