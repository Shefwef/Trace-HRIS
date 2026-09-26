'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Save, X, UserX, UserCheck, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  useEmployeeProfile,
  useUpdateEmployee,
  useSoftDeleteEmployee,
  useRestoreEmployee,
  usePermanentDeleteEmployee,
  useUsers,
} from '@/lib/hooks';
import { checkPermissionSync } from '@/lib/permissionsMeta';
import { avatarColorFor, initials, useCurrentUser } from '@/lib/session';
import { useStore } from '@/lib/store';
import { Avatar } from '../../components/ui/Avatar';
import { AvatarUpload } from '../../components/ui/AvatarUpload';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { cx, fmtDate } from '../../lib/utils';
import './EmployeeProfile.css';

type AppRole = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'LINE_MANAGER' | 'EMPLOYEE';

const ROLE_LABEL: Record<AppRole, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', HR: 'HR', LINE_MANAGER: 'Line Manager', EMPLOYEE: 'Employee',
};
const ROLE_BADGE: Record<AppRole, 'info' | 'replacement' | 'success' | 'default' | 'warning'> = {
  SUPER_ADMIN: 'success', ADMIN: 'info', HR: 'replacement', LINE_MANAGER: 'warning', EMPLOYEE: 'default',
};

function assignableRoles(actor: { role: string; roles?: string[] | null }): AppRole[] {
  const roles = actor.roles?.length ? actor.roles : [actor.role];
  if (roles.includes('SUPER_ADMIN') || roles.includes('ADMIN'))
    return ['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'];
  if (roles.includes('HR')) return ['HR', 'LINE_MANAGER', 'EMPLOYEE'];
  return [];
}

interface DraftProfile {
  fullName: string;
  designation: string;
  department: string;
  employeeIdCode: string;
  phone: string;
  dateOfBirth: string;
  joiningDate: string;
  avatarUrl: string;
  lineManagerId: string | null;
  roles: AppRole[];
}

export function EmployeeProfilePage({ id }: { id: string }) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { data: profile, isLoading, error } = useEmployeeProfile(id);
  const { data: allUsers = [] } = useUsers({ includeDeactivated: false });
  const update = useUpdateEmployee();
  const softDelete = useSoftDeleteEmployee();
  const restore = useRestoreEmployee();
  const permaDelete = usePermanentDeleteEmployee();
  const addToast = useStore((s) => s.addToast);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftProfile | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmPermaDelete, setConfirmPermaDelete] = useState(false);

  // Seed the draft when profile loads or we exit edit mode.
  useEffect(() => {
    if (!profile) return;
    setDraft({
      fullName: profile.fullName,
      designation: profile.designation ?? '',
      department: profile.department ?? '',
      employeeIdCode: profile.employeeIdCode ?? '',
      phone: profile.phone ?? '',
      dateOfBirth: profile.dateOfBirth ?? '',
      joiningDate: profile.joiningDate ?? '',
      avatarUrl: profile.avatarUrl ?? '',
      lineManagerId: profile.lineManagerId ?? null,
      roles: (profile.roles as AppRole[]) ?? [],
    });
  }, [profile]);

  const actorRoles = useMemo<AppRole[]>(() => {
    if (!currentUser) return [];
    return (currentUser.roles?.length ? currentUser.roles : [currentUser.role]) as AppRole[];
  }, [currentUser]);

  const isSelf = currentUser?.id === id;
  const isFullReviewer = actorRoles.some((r) => r === 'ADMIN' || r === 'HR' || r === 'SUPER_ADMIN');
  const isLineManager = actorRoles.includes('LINE_MANAGER');

  // Permission matrix per the spec:
  //   Admin/HR/SUPER_ADMIN: edit + deactivate + delete + see balance
  //   Line Manager: view direct reports + balance, no deactivate/delete
  //   Employee (self): edit own profile, view own balance, no deactivate/delete
  const canDeactivate = isFullReviewer && !isSelf;
  const canDelete = isFullReviewer && !isSelf;
  const canRestore = isFullReviewer;
  const canPermaDelete = isFullReviewer;
  const canEdit = isFullReviewer || isSelf;
  const canEditRoles = assignableRoles(currentUser ?? { role: 'EMPLOYEE' }).length > 0 && !isSelf;
  const canEditLineManager = currentUser
    ? checkPermissionSync(
        { role: currentUser.role, roles: currentUser.roles ?? null },
        'employee.assign_line_manager',
      )
    : false;

  // Line-manager candidates: active LM-role users, excluding self.
  const lmCandidates = useMemo(
    () => allUsers.filter(
      (u) => u.isActive && u.id !== id &&
        (u.roles?.length ? u.roles : [u.role]).includes('LINE_MANAGER'),
    ),
    [allUsers, id],
  );
  if (isLoading) return <div className="ep-loading">Loading profile…</div>;
  if (error) return <div className="ep-error">Failed to load profile: {(error as Error).message}</div>;
  if (!profile || !draft) return null;

  const status: 'ACTIVE' | 'DEACTIVATED' | 'DELETED' = profile.deletedAt
    ? 'DELETED'
    : profile.isActive ? 'ACTIVE' : 'DEACTIVATED';

  function toggleRole(role: AppRole) {
    if (!draft) return;
    setDraft({ ...draft, roles: draft.roles.includes(role) ? draft.roles.filter((r) => r !== role) : [...draft.roles, role] });
  }

  function saveChanges() {
    if (!draft) return;
    const patch: Record<string, unknown> = {
      fullName: draft.fullName,
      designation: draft.designation || undefined,
      department: draft.department || undefined,
      employeeIdCode: draft.employeeIdCode || undefined,
      phone: draft.phone || undefined,
      dateOfBirth: draft.dateOfBirth || undefined,
      joiningDate: draft.joiningDate || undefined,
      avatarUrl: draft.avatarUrl || undefined,
    };
    if (canEditRoles && draft.roles.length > 0) patch.roles = draft.roles;
    if (canEditLineManager) patch.lineManagerId = draft.lineManagerId;

    update.mutate(
      { id, patch: patch as never },
      {
        onSuccess: () => {
          addToast({ kind: 'success', title: 'Profile saved' });
          setEditing(false);
        },
        onError: (e: Error) => addToast({ kind: 'error', title: 'Could not save', body: e.message }),
      },
    );
  }

  function toggleActive(next: boolean) {
    update.mutate(
      { id, patch: { isActive: next } as never },
      {
        onSuccess: () => addToast({ kind: 'success', title: next ? 'Reactivated' : 'Deactivated' }),
        onError: (e: Error) => addToast({ kind: 'error', title: 'Failed', body: e.message }),
      },
    );
  }

  return (
    <div className={cx('ep', status === 'DEACTIVATED' && 'ep-deactivated', status === 'DELETED' && 'ep-deleted')}>
      <div className="ep-topbar">
        <Link href="/admin/employees" className="ep-back">
          <ArrowLeft size={16} /> Back to Employees
        </Link>
      </div>

      {status !== 'ACTIVE' && (
        <div className={cx('ep-banner', status === 'DELETED' ? 'ep-banner-danger' : 'ep-banner-warn')}>
          <AlertTriangle size={16} />
          {status === 'DELETED'
            ? <>This account is in the Deleted bin{profile.deletedAt && ` — scheduled for permanent removal on ${fmtDate(new Date(new Date(profile.deletedAt).getTime() + 60 * 86_400_000).toISOString(), 'd MMM yyyy')}`}. Restore it to bring it back to Deactivated, or delete permanently.</>
            : <>This account is deactivated. The employee cannot sign in.</>
          }
        </div>
      )}

      {/* Header card */}
      <div className="card ep-header">
        {editing ? (
          <div className="ep-header-avatar-edit">
            <AvatarUpload
              value={draft.avatarUrl}
              name={draft.fullName || profile.fullName}
              onChange={(url) => setDraft({ ...draft, avatarUrl: url })}
            />
          </div>
        ) : (
          <Avatar
            initials={initials(profile.fullName)}
            color={avatarColorFor(profile.id)}
            size="lg"
            imageUrl={profile.avatarUrl}
            alt={profile.fullName}
          />
        )}
        <div className="ep-header-body">
          {editing ? (
            <TextInput
              className="ep-header-name-input"
              value={draft.fullName}
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
            />
          ) : (
            <h1 className="ep-header-name">{profile.fullName}</h1>
          )}
          <div className="ep-header-meta">
            <span>{profile.designation ?? <em className="muted">No designation</em>}</span>
            {profile.employeeIdCode && (
              <>
                <span className="ep-dot">·</span>
                <span className="mono">ID: {profile.employeeIdCode}</span>
              </>
            )}
          </div>
          <div className="ep-header-roles">
            {(profile.roles as AppRole[]).map((r) => (
              <Badge key={r} variant={ROLE_BADGE[r]}>{ROLE_LABEL[r]}</Badge>
            ))}
          </div>
        </div>
        {canEdit && !editing && (
          <Button variant="secondary" leadingIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        )}
        {editing && (
          <div className="ep-header-actions">
            <Button variant="ghost" leadingIcon={<X size={14} />} onClick={() => { setEditing(false); }}>
              Cancel
            </Button>
            <Button variant="primary" leadingIcon={<Save size={14} />} loading={update.isPending} onClick={saveChanges}>
              Save changes
            </Button>
          </div>
        )}
      </div>

      <div className="ep-grid">
        {/* Profile details (fills the tall left column) */}
        <section className="card ep-section ep-section-primary">
          <h2>Profile details</h2>
          <div className="ep-fields">
            <ProfileField label="Email" value={profile.email} readOnly />
            <ProfileField
              label="Employee ID"
              editing={editing && isFullReviewer}
              value={editing && isFullReviewer ? draft.employeeIdCode : (profile.employeeIdCode ?? '—')}
              onChange={(v) => setDraft({ ...draft, employeeIdCode: v })}
              readOnly={!isFullReviewer}
            />
            <ProfileField
              label="Designation"
              editing={editing}
              value={editing ? draft.designation : (profile.designation ?? '—')}
              onChange={(v) => setDraft({ ...draft, designation: v })}
            />
            <ProfileField
              label="Department"
              editing={editing}
              value={editing ? draft.department : (profile.department ?? '—')}
              onChange={(v) => setDraft({ ...draft, department: v })}
            />
            <ProfileField
              label="Phone"
              editing={editing}
              value={editing ? draft.phone : (profile.phone ?? '—')}
              onChange={(v) => setDraft({ ...draft, phone: v })}
            />
            <ProfileField
              label="Date of birth"
              type="date"
              editing={editing}
              value={editing ? draft.dateOfBirth : (profile.dateOfBirth ? fmtDate(profile.dateOfBirth) : '—')}
              onChange={(v) => setDraft({ ...draft, dateOfBirth: v })}
            />
            <ProfileField
              label="Joining date"
              type="date"
              editing={editing && isFullReviewer}
              value={editing && isFullReviewer ? draft.joiningDate : (profile.joiningDate ? fmtDate(profile.joiningDate) : '—')}
              onChange={(v) => setDraft({ ...draft, joiningDate: v })}
              readOnly={!isFullReviewer}
            />
          </div>
        </section>

        {/* Right column: Roles + Line manager stacked */}
        <div className="ep-right-stack">
          <section className="card ep-section">
            <h2>Roles</h2>
          {editing && canEditRoles ? (
            <div className="ep-roles-editor">
              {/* SUPER_ADMIN is intentionally omitted from the picker — that role
                  is provisioned through infrastructure only, never granted from
                  the UI. */}
              {(['ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'] as AppRole[]).map((r) => {
                const allowed = assignableRoles(currentUser ?? { role: 'EMPLOYEE' }).includes(r);
                const on = draft.roles.includes(r);
                return (
                  <label key={r} className={cx('ep-role-chip', on && 'ep-role-chip-on', !allowed && 'ep-role-chip-disabled')}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!allowed}
                      onChange={() => allowed && toggleRole(r)}
                    />
                    <span>{ROLE_LABEL[r]}</span>
                  </label>
                );
              })}
              <p className="muted ep-hint">
                You can grant: {assignableRoles(currentUser ?? { role: 'EMPLOYEE' }).filter((r) => r !== 'SUPER_ADMIN').map((r) => ROLE_LABEL[r]).join(', ') || '—'}.
              </p>
            </div>
          ) : (
            <div className="ep-roles-view">
              {(profile.roles as AppRole[]).length === 0 ? (
                <span className="muted">No roles assigned.</span>
              ) : (
                (profile.roles as AppRole[]).map((r) => (
                  <Badge key={r} variant={ROLE_BADGE[r]}>{ROLE_LABEL[r]}</Badge>
                ))
              )}
            </div>
          )}
        </section>

          {/* Line manager — editable by HR/Admin only, read-only for
              everyone else including the employee themselves. */}
          <section className="card ep-section">
            <h2>Line manager</h2>
            {editing && canEditLineManager ? (
              <select
                className="input"
                value={draft.lineManagerId ?? ''}
                onChange={(e) => setDraft({ ...draft, lineManagerId: e.target.value || null })}
              >
                <option value="">— None —</option>
                {lmCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}{u.designation ? ` (${u.designation})` : ''}
                  </option>
                ))}
              </select>
            ) : profile.lineManager ? (
              <div className="ep-lm">
                <Avatar
                  initials={initials(profile.lineManager.fullName)}
                  color={avatarColorFor(profile.lineManager.id)}
                  size="sm"
                  alt={profile.lineManager.fullName}
                />
                <span>{profile.lineManager.fullName}</span>
              </div>
            ) : (
              <span className="muted">No line manager assigned.</span>
            )}
          </section>
        </div>

        {/* Leave balance */}
        <section className="card ep-section ep-section-wide">
          <h2>Leave balance <span className="muted ep-year">· {profile.balance?.cycleYear ?? new Date().getFullYear()}</span></h2>
          {profile.balance ? (
            <table className="ep-balance-table">
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="ep-num">Total</th>
                  <th className="ep-num">Used</th>
                  <th className="ep-num">Pending</th>
                  <th className="ep-num">Remaining</th>
                </tr>
              </thead>
              <tbody>
                <BalanceRow
                  type="Casual"
                  variant="casual"
                  total={profile.balance.casualTotal}
                  used={profile.balance.casualUsed}
                  pending={profile.balance.casualPending}
                />
                <BalanceRow
                  type="Sick"
                  variant="sick"
                  total={profile.balance.sickTotal}
                  used={profile.balance.sickUsed}
                  pending={profile.balance.sickPending}
                />
                <tr>
                  <td>
                    <Badge variant="replacement">Replacement</Badge>
                  </td>
                  <td className="ep-num muted">—</td>
                  <td className="ep-num muted">—</td>
                  <td className="ep-num muted">—</td>
                  <td className="ep-num mono">
                    <strong>{profile.balance.replacementBalance}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <span className="muted">No leave balance for this cycle yet.</span>
          )}
        </section>
      </div>

      {/* Danger zone (deactivate / delete / restore) */}
      {(canDeactivate || canDelete || canRestore || canPermaDelete) && (
        <div className="card ep-danger">
          <h2>Action</h2>
          <div className="ep-danger-actions">
            {status === 'ACTIVE' && canDeactivate && (
              <Button variant="secondary" leadingIcon={<UserX size={14} />} onClick={() => setConfirmDeactivate(true)}>
                Deactivate account
              </Button>
            )}
            {status === 'DEACTIVATED' && canDeactivate && (
              <Button variant="secondary" leadingIcon={<UserCheck size={14} />} onClick={() => setConfirmReactivate(true)}>
                Reactivate
              </Button>
            )}
            {(status === 'ACTIVE' || status === 'DEACTIVATED') && canDelete && (
              <Button variant="danger" leadingIcon={<Trash2 size={14} />} onClick={() => setConfirmDelete(true)}>
                Delete account
              </Button>
            )}
            {status === 'DELETED' && canRestore && (
              <Button variant="secondary" leadingIcon={<RotateCcw size={14} />} onClick={() => setConfirmRestore(true)}>
                Restore
              </Button>
            )}
            {status === 'DELETED' && canPermaDelete && (
              <Button variant="danger" leadingIcon={<Trash2 size={14} />} onClick={() => setConfirmPermaDelete(true)}>
                Delete permanently
              </Button>
            )}
          </div>
          {status === 'ACTIVE' && (
            <p className="muted ep-danger-hint">
              Deactivating blocks sign-in but preserves history. Deleting moves the account to the Deleted bin for 60 days before automatic permanent removal.
            </p>
          )}
        </div>
      )}

      {/* Confirmation modals */}
      <Modal
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        title="Deactivate this account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeactivate(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { setConfirmDeactivate(false); toggleActive(false); }}>
              Yes, deactivate
            </Button>
          </>
        }
      >
        <p>{profile.fullName} will lose sign-in access immediately. Their history is preserved. You can reactivate them any time.</p>
      </Modal>

      <Modal
        open={confirmReactivate}
        onClose={() => setConfirmReactivate(false)}
        title="Reactivate this account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReactivate(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setConfirmReactivate(false); toggleActive(true); }}>
              Yes, reactivate
            </Button>
          </>
        }
      >
        <p>{profile.fullName} will be able to sign in again immediately.</p>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={softDelete.isPending}
              onClick={() =>
                softDelete.mutate(id, {
                  onSuccess: () => { setConfirmDelete(false); addToast({ kind: 'success', title: 'Moved to Deleted' }); router.push('/admin/employees'); },
                  onError: (e: Error) => addToast({ kind: 'error', title: 'Failed', body: e.message }),
                })
              }
            >
              Yes, delete
            </Button>
          </>
        }
      >
        <p>
          {profile.fullName} will be moved to the Deleted bin. You have <strong>60 days</strong> to restore them before they&apos;re permanently removed.
        </p>
      </Modal>

      <Modal
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        title="Restore this account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRestore(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={restore.isPending}
              onClick={() =>
                restore.mutate(id, {
                  onSuccess: () => { setConfirmRestore(false); addToast({ kind: 'success', title: 'Restored' }); },
                  onError: (e: Error) => addToast({ kind: 'error', title: 'Failed', body: e.message }),
                })
              }
            >
              Yes, restore
            </Button>
          </>
        }
      >
        <p>
          {profile.fullName} will return to the Deactivated list. You still need to Reactivate to give them sign-in access again.
        </p>
      </Modal>

      <Modal
        open={confirmPermaDelete}
        onClose={() => setConfirmPermaDelete(false)}
        title="Permanently delete this account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmPermaDelete(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={permaDelete.isPending}
              onClick={() =>
                permaDelete.mutate(id, {
                  onSuccess: () => { setConfirmPermaDelete(false); addToast({ kind: 'success', title: 'Permanently deleted' }); router.push('/admin/employees'); },
                  onError: (e: Error) => addToast({ kind: 'error', title: 'Failed', body: e.message }),
                })
              }
            >
              Yes, delete forever
            </Button>
          </>
        }
      >
        <p>
          This <strong>cannot be undone</strong>. {profile.fullName}&apos;s attendance, leaves and balance rows will be removed. Historical biometric punches will be kept but orphaned.
        </p>
      </Modal>
    </div>
  );
}

function ProfileField({
  label, value, onChange, editing = false, type = 'text', readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  editing?: boolean;
  type?: 'text' | 'date';
  readOnly?: boolean;
}) {
  return (
    <div className="ep-field">
      <span className="ep-field-label">{label}</span>
      {editing && !readOnly ? (
        <TextInput type={type} value={value} onChange={(e) => onChange?.(e.target.value)} />
      ) : (
        <span className="ep-field-value">{value || <em className="muted">—</em>}</span>
      )}
    </div>
  );
}

function BalanceRow({ type, variant, total, used, pending }: {
  type: string;
  variant: 'casual' | 'sick';
  total: number; used: number; pending: number;
}) {
  const remaining = total - used - pending;
  return (
    <tr>
      <td><Badge variant={variant}>{type}</Badge></td>
      <td className="ep-num mono">{total}</td>
      <td className="ep-num mono">{used}</td>
      <td className="ep-num mono">{pending}</td>
      <td className="ep-num mono"><strong>{remaining}</strong></td>
    </tr>
  );
}
