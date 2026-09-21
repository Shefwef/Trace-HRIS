'use client';
import { useMemo, useState } from 'react';
import { Search, Mail, UserPlus, UserX, ShieldCheck, Users, RefreshCw, Gift, Coffee, Pencil } from 'lucide-react';
import { useUsers, useUpdateEmployee } from '@/lib/hooks';
import { initials, avatarColorFor, useCurrentUser } from '@/lib/session';
import { useStore } from '@/lib/store';
import { checkPermissionSync } from '@/lib/permissionsMeta';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { InviteEmployeeModal } from '../../components/admin/InviteEmployeeModal';
import { EmployeeProfileForm, type ProfileFormValues } from '../../components/admin/EmployeeProfileForm';
import { GrantReplacementLeaveModal } from '../../components/admin/GrantReplacementLeaveModal';
import { ReplacementLeavesModal } from '../../components/admin/ReplacementLeavesModal';
import { cx } from '../../lib/utils';
import './Employees.css';

type AppRole = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'LINE_MANAGER' | 'EMPLOYEE';

function assignableRoles(actorRole: string | undefined): AppRole[] {
  if (actorRole === 'SUPER_ADMIN' || actorRole === 'ADMIN')
    return ['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'];
  if (actorRole === 'HR') return ['HR', 'LINE_MANAGER', 'EMPLOYEE'];
  return [];
}

const ROLE_LABEL: Record<AppRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  LINE_MANAGER: 'Line Manager',
  EMPLOYEE: 'Employee',
};

const ROLE_BADGE_VARIANT: Record<AppRole, 'info' | 'replacement' | 'success' | 'default' | 'warning'> = {
  SUPER_ADMIN: 'success',
  ADMIN: 'info',
  HR: 'replacement',
  LINE_MANAGER: 'warning',
  EMPLOYEE: 'default',
};

function toggleRole(current: AppRole[], role: AppRole): AppRole[] {
  return current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
}

/** Split "Full Name" into first / last so the shared form can round-trip. */
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

const EMPTY_PROFILE: ProfileFormValues = {
  firstName: '', lastName: '', email: '', phone: '',
  dateOfBirth: '', avatarUrl: '',
  employeeIdCode: '', joiningDate: '',
  designation: '', department: '',
  cycleStartMonth: 1,
  roles: [],
};

export function EmployeesPage() {
  const currentUser = useCurrentUser();
  const { data: users = [], isLoading } = useUsers({ includeDeactivated: true });
  const updateEmployee = useUpdateEmployee();
  const addToast = useStore((s) => s.addToast);

  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'ACTIVE' | 'DEACTIVATED' | 'ALL'>('ACTIVE');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [reactivateId, setReactivateId] = useState<string | null>(null);
  const [rolesEditId, setRolesEditId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<AppRole[]>([]);
  const [teamAssignId, setTeamAssignId] = useState<string | null>(null);
  const [pendingTeam, setPendingTeam] = useState<Set<string>>(new Set());
  const [grantLeaveId, setGrantLeaveId] = useState<string | null>(null);
  const [viewLeavesId, setViewLeavesId] = useState<string | null>(null);
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const [pendingProfile, setPendingProfile] = useState<ProfileFormValues>(EMPTY_PROFILE);

  const rolesEditUser = rolesEditId ? users.find((u) => u.id === rolesEditId) : null;
  const teamAssignUser = teamAssignId ? users.find((u) => u.id === teamAssignId) : null;
  const grantLeaveUser = grantLeaveId ? users.find((u) => u.id === grantLeaveId) : null;
  const viewLeavesUser = viewLeavesId ? users.find((u) => u.id === viewLeavesId) : null;
  const editProfileUser = editProfileId ? users.find((u) => u.id === editProfileId) : null;

  const canAssign = assignableRoles(currentUser?.role);
  const canEditRoles = canAssign.length > 0;
  const canAssignTeam = canAssign.length > 0;

  const canGrantReplacement = currentUser
    ? checkPermissionSync(
        { role: currentUser.role as any, roles: (currentUser.roles as any) ?? null },
        'replacement.grant',
      )
    : false;
  const canViewOthersReplacement = currentUser
    ? checkPermissionSync(
        { role: currentUser.role as any, roles: (currentUser.roles as any) ?? null },
        'replacement.view_others',
      )
    : false;
  const actorRoles = currentUser?.roles?.length ? currentUser.roles : currentUser ? [currentUser.role] : [];
  const isFullReviewer =
    actorRoles.includes('ADMIN') ||
    actorRoles.includes('HR') ||
    actorRoles.includes('SUPER_ADMIN');
  const isLineManagerOnly = !isFullReviewer && actorRoles.includes('LINE_MANAGER');

  function canActOnEmployee(target: { id: string; isActive: boolean; role: string; roles?: string[]; lineManagerId?: string | null }): boolean {
    if (!currentUser) return false;
    if (target.id === currentUser.id) return false;
    if (!target.isActive) return false;
    const targetRoles = target.roles?.length ? target.roles : [target.role];
    if (!targetRoles.includes('EMPLOYEE')) return false;
    if (isFullReviewer) return true;
    if (isLineManagerOnly) return target.lineManagerId === currentUser.id;
    return false;
  }

  const filtered = useMemo(
    () =>
      users
        .filter((u) => {
          if (tab === 'ACTIVE') return u.isActive;
          if (tab === 'DEACTIVATED') return !u.isActive;
          return true;
        })
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
    [users, q, tab]
  );

  const teamSizes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users) {
      if (u.isActive && u.lineManagerId) {
        counts.set(u.lineManagerId, (counts.get(u.lineManagerId) || 0) + 1);
      }
    }
    return counts;
  }, [users]);

  const teamCandidates = useMemo(() => {
    if (!teamAssignUser) return [];
    return users.filter(
      (u) =>
        u.isActive &&
        u.id !== teamAssignUser.id &&
        !(u.roles?.length ? u.roles : [u.role]).includes('LINE_MANAGER'),
    );
  }, [users, teamAssignUser]);

  function updateRoles(id: string, nextRoles: AppRole[]) {
    if (nextRoles.length === 0) {
      addToast({ kind: 'error', title: 'At least one role required' });
      return;
    }
    updateEmployee.mutate(
      { id, patch: { roles: nextRoles } },
      {
        onSuccess: () => addToast({ kind: 'success', title: 'Roles updated' }),
        onError: (e: Error) => addToast({ kind: 'error', title: 'Could not update roles', body: e.message }),
      },
    );
  }

  function handleSaveTeam() {
    if (!teamAssignId) return;

    const currentTeam = new Set(users.filter(u => u.lineManagerId === teamAssignId).map(u => u.id));
    const added = [...pendingTeam].filter(id => !currentTeam.has(id));
    const removed = [...currentTeam].filter(id => !pendingTeam.has(id));

    let pendingCount = added.length + removed.length;
    let errCount = 0;

    const finalize = () => {
      pendingCount--;
      if (pendingCount === 0) {
        setTeamAssignId(null);
        if (errCount > 0) addToast({ kind: 'error', title: 'Some team assignments failed' });
        else addToast({ kind: 'success', title: 'Team updated successfully' });
      }
    };

    if (pendingCount === 0) {
      setTeamAssignId(null);
      return;
    }

    added.forEach(id => {
      updateEmployee.mutate({ id, patch: { lineManagerId: teamAssignId } }, {
        onSuccess: finalize, onError: () => { errCount++; finalize(); }
      });
    });

    removed.forEach(id => {
      updateEmployee.mutate({ id, patch: { lineManagerId: null } }, {
        onSuccess: finalize, onError: () => { errCount++; finalize(); }
      });
    });
  }

  function handleSaveProfile() {
    if (!editProfileId) return;
    const fullName = `${pendingProfile.firstName} ${pendingProfile.lastName}`.trim();
    updateEmployee.mutate(
      {
        id: editProfileId,
        patch: {
          fullName: fullName || undefined,
          department: pendingProfile.department.trim() || undefined,
          designation: pendingProfile.designation.trim() || undefined,
          employeeIdCode: pendingProfile.employeeIdCode.trim() || undefined,
          phone: pendingProfile.phone.trim() || undefined,
          dateOfBirth: pendingProfile.dateOfBirth || undefined,
          joiningDate: pendingProfile.joiningDate || undefined,
          avatarUrl: pendingProfile.avatarUrl.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditProfileId(null);
          addToast({ kind: 'success', title: 'Profile updated' });
        },
        onError: (e: Error) => addToast({ kind: 'error', title: 'Could not update profile', body: e.message }),
      }
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

      <div className="empg-filters">
        <div className="empg-tabs">
          <button className={cx('empg-tab', tab === 'ACTIVE' && 'active')} onClick={() => setTab('ACTIVE')}>
            Active
          </button>
          <button className={cx('empg-tab', tab === 'DEACTIVATED' && 'active')} onClick={() => setTab('DEACTIVATED')}>
            Deactivated
          </button>
          <button className={cx('empg-tab', tab === 'ALL' && 'active')} onClick={() => setTab('ALL')}>
            All
          </button>
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
            <button type="button" className="empg-search-clear" onClick={() => setQ('')} aria-label="Clear search">×</button>
          )}
        </div>
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
            const isLM = currentRoles.includes('LINE_MANAGER');
            const teamSize = teamSizes.get(u.id) || 0;
            const isSelf = u.id === currentUser?.id;

            const showGrant = canGrantReplacement && canActOnEmployee(u);
            const showLeaves = canViewOthersReplacement && canActOnEmployee(u);
            const showRoles = canEditRoles && u.isActive;

            const showExtraActions = isFullReviewer || (!isSelf && canAssignTeam && isLM && u.isActive);

            return (
              <div key={u.id} className={cx('empg-card card', !u.isActive && 'empg-card-deactivated')}>
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
                      {isSelf && <Badge variant="info">You</Badge>}
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
                  <div className="empg-info-row mono">{u.employeeIdCode ?? '—'}</div>
                  <div className="empg-info-row empg-mail"><Mail size={12} /> {u.email}</div>

                  {isLM && u.isActive && (
                     <div className="empg-info-row empg-team-info">
                       <Users size={12} /> Team size: <strong>{teamSize}</strong>
                     </div>
                  )}
                  {u.lineManager && u.isActive && !isLM && (
                     <div className="empg-info-row empg-lm-info">
                       <ShieldCheck size={12} /> Manager: <strong>{u.lineManager.fullName}</strong>
                     </div>
                  )}
                </div>

                {/* Card footer — always rendered for consistent height across the row */}
                <div className="empg-card-footer">
                  {/* Extra actions: Edit profile + Assign team (above the main grid) */}
                  {showExtraActions && (
                    <div className="empg-card-extra-actions">
                      {isFullReviewer && (
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<Pencil size={12} />}
                          onClick={() => {
                            const { firstName, lastName } = splitName(u.fullName);
                            setEditProfileId(u.id);
                            setPendingProfile({
                              firstName, lastName,
                              email: u.email,
                              department: u.department ?? '',
                              designation: u.designation ?? '',
                              employeeIdCode: u.employeeIdCode ?? '',
                              phone: u.phone ?? '',
                              dateOfBirth: u.dateOfBirth ? u.dateOfBirth.slice(0, 10) : '',
                              joiningDate: u.joiningDate ? u.joiningDate.slice(0, 10) : '',
                              avatarUrl: u.avatarUrl ?? '',
                              cycleStartMonth: 1,
                              roles: [],
                            });
                          }}
                        >
                          Edit profile
                        </Button>
                      )}
                      {!isSelf && canAssignTeam && isLM && u.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<Users size={12} />}
                          onClick={() => {
                            setTeamAssignId(u.id);
                            setPendingTeam(new Set(users.filter(x => x.lineManagerId === u.id).map(x => x.id)));
                          }}
                        >
                          Assign team
                        </Button>
                      )}
                    </div>
                  )}

                  {isSelf ? (
                    /* Self card: show self-note; the invisible grid below preserves height */
                    <span className="muted empg-self-note">
                      Ask another admin to change your own roles or status.
                    </span>
                  ) : null}

                  {/* Main 2×2 button grid — always rendered so every card in a row
                      has identical footer height, keeping buttons vertically aligned.
                      Buttons that don't apply are hidden with visibility:hidden. */}
                  <div className="empg-card-main-actions">
                    <div className={isSelf || !showGrant ? 'empg-btn-invisible' : ''}>
                      <Button
                        variant="ghost"
                        size="sm"
                        leadingIcon={<Gift size={12} />}
                        onClick={() => setGrantLeaveId(u.id)}
                      >
                        Grant leave
                      </Button>
                    </div>
                    <div className={isSelf || !showLeaves ? 'empg-btn-invisible' : ''}>
                      <Button
                        variant="ghost"
                        size="sm"
                        leadingIcon={<Coffee size={12} />}
                        onClick={() => setViewLeavesId(u.id)}
                      >
                        Leaves
                      </Button>
                    </div>
                    <div className={isSelf || !showRoles ? 'empg-btn-invisible' : ''}>
                      <Button
                        variant="ghost"
                        size="sm"
                        leadingIcon={<ShieldCheck size={12} />}
                        onClick={() => { setRolesEditId(u.id); setPendingRoles(currentRoles); }}
                      >
                        Roles
                      </Button>
                    </div>
                    <div className={isSelf ? 'empg-btn-invisible' : ''}>
                      {u.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<UserX size={12} />}
                          onClick={() => setDeactivateId(u.id)}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<RefreshCw size={12} />}
                          onClick={() => setReactivateId(u.id)}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <InviteEmployeeModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <GrantReplacementLeaveModal
        open={!!grantLeaveId}
        onClose={() => setGrantLeaveId(null)}
        employee={grantLeaveUser ? { id: grantLeaveUser.id, fullName: grantLeaveUser.fullName } : null}
      />

      <ReplacementLeavesModal
        open={!!viewLeavesId}
        onClose={() => setViewLeavesId(null)}
        employee={viewLeavesUser ? { id: viewLeavesUser.id, fullName: viewLeavesUser.fullName } : null}
      />

      {/* Edit profile modal */}
      <Modal
        open={!!editProfileId}
        onClose={() => setEditProfileId(null)}
        title={editProfileUser ? `Edit profile — ${editProfileUser.fullName}` : 'Edit profile'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditProfileId(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={updateEmployee.isPending}
              disabled={`${pendingProfile.firstName} ${pendingProfile.lastName}`.trim().length < 2}
              onClick={handleSaveProfile}
            >
              Save changes
            </Button>
          </>
        }
      >
        <EmployeeProfileForm
          mode="edit-admin"
          values={pendingProfile}
          onChange={(patch) => setPendingProfile((p) => ({ ...p, ...patch }))}
        />
      </Modal>

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
        open={!!reactivateId}
        onClose={() => setReactivateId(null)}
        title="Reactivate employee?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReactivateId(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={updateEmployee.isPending}
              onClick={() => {
                if (!reactivateId) return;
                updateEmployee.mutate(
                  { id: reactivateId, patch: { isActive: true } },
                  { onSuccess: () => setReactivateId(null) }
                );
              }}
            >
              Reactivate
            </Button>
          </>
        }
      >
        <p>This user will be able to sign in again and appear in active employee lists.</p>
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
          {(['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'] as AppRole[]).map((r) => {
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

      <Modal
        open={!!teamAssignId}
        onClose={() => setTeamAssignId(null)}
        title={teamAssignUser ? `Assign team to ${teamAssignUser.fullName}` : 'Assign team'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTeamAssignId(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={updateEmployee.isPending}
              onClick={handleSaveTeam}
            >
              Save team
            </Button>
          </>
        }
      >
        <p className="empg-modal-desc">
          Select the employees that will report to this Line Manager. The Line Manager will approve their leaves and extra work.
        </p>
        <div className="empg-team-list">
          {teamCandidates.length === 0 ? (
            <div className="muted">No eligible employees found.</div>
          ) : (
            teamCandidates.map(u => {
              const checked = pendingTeam.has(u.id);
              return (
                <label key={u.id} className={`empg-team-check ${checked ? 'is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(pendingTeam);
                      if (e.target.checked) next.add(u.id);
                      else next.delete(u.id);
                      setPendingTeam(next);
                    }}
                  />
                  <div className="empg-team-member">
                    <Avatar initials={initials(u.fullName)} color={avatarColorFor(u.id)} size="sm" imageUrl={u.avatarUrl} />
                    <div className="empg-team-member-info">
                      <div className="name">{u.fullName}</div>
                      <div className="desig">{u.designation}</div>
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </Modal>
    </div>
  );
}
