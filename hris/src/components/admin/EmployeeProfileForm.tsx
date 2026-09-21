'use client';
import { Field, TextInput } from '../ui/Field';
import { AvatarUpload } from '../ui/AvatarUpload';
import './InviteEmployeeModal.css';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'LINE_MANAGER' | 'EMPLOYEE';

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin (CEO/CTO)',
  HR: 'HR',
  LINE_MANAGER: 'Line Manager',
  EMPLOYEE: 'Employee',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  avatarUrl: string;
  employeeIdCode: string;
  joiningDate: string;
  designation: string;
  department: string;
  cycleStartMonth: number;
  roles: Role[];
}

interface Props {
  /**
   * - `invite`: creating a new user. Email + Employee ID + Designation required.
   * - `edit-admin`: HR/Admin editing an existing user. Email locked; roles editable.
   * - `edit-self`: user editing their own profile. Only name/phone/birthday/avatar editable.
   */
  mode: 'invite' | 'edit-admin' | 'edit-self';
  values: ProfileFormValues;
  onChange: (patch: Partial<ProfileFormValues>) => void;
  /** Which roles the acting user is allowed to grant (invite / edit-admin only). */
  allowedRoles?: Role[];
}

/**
 * Shared form used by Invite Employee, admin Edit Profile, and My Profile.
 * Layout is always: avatar → personal → employment → roles (when applicable).
 * Non-editable fields render disabled so users can still see their own values.
 */
export function EmployeeProfileForm({ mode, values, onChange, allowedRoles = [] }: Props) {
  const isInvite = mode === 'invite';
  const isSelf   = mode === 'edit-self';
  const showRoles = mode === 'invite' || mode === 'edit-admin';
  const showCycle = mode === 'invite';

  // Fields employees can't change on their own profile — shown disabled.
  const adminOnly = isSelf;

  function set<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) {
    onChange({ [key]: value } as Partial<ProfileFormValues>);
  }

  function toggleRole(r: Role) {
    const next = values.roles.includes(r)
      ? values.roles.filter((x) => x !== r)
      : [...values.roles, r];
    onChange({ roles: next });
  }

  const displayName = `${values.firstName} ${values.lastName}`.trim() || 'New Employee';

  return (
    <div className="inv-form">
      {/* Avatar first — at the very top, followed by all the info */}
      <Field label="Profile picture">
        <AvatarUpload
          value={values.avatarUrl}
          name={displayName}
          onChange={(url) => set('avatarUrl', url)}
        />
      </Field>

      {/* Personal info */}
      <div className="inv-section-label">Personal info</div>
      <div className="inv-row">
        <Field label="First name" required={isInvite}>
          <TextInput
            value={values.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            placeholder="Jane"
          />
        </Field>
        <Field label="Last name">
          <TextInput
            value={values.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            placeholder="Doe"
          />
        </Field>
      </div>
      <div className="inv-row">
        <Field
          label="Official email"
          required={isInvite}
          hint={isInvite ? "They'll use this to sign in." : isSelf ? 'Ask HR if this needs to change.' : 'Email is managed via Clerk — cannot be changed here.'}
        >
          <TextInput
            type="email"
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="jane.doe@company.com"
            disabled={!isInvite}
          />
        </Field>
        <Field label="Phone number">
          <TextInput
            type="tel"
            value={values.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+880 17xx xxxxxx"
          />
        </Field>
      </div>
      <Field label="Birthday">
        <input
          type="date"
          className="input"
          value={values.dateOfBirth}
          onChange={(e) => set('dateOfBirth', e.target.value)}
        />
      </Field>

      {/* Employment */}
      <div className="inv-section-label">Employment</div>
      <div className="inv-row">
        <Field
          label="Employee ID"
          required={isInvite}
          hint={adminOnly ? 'Managed by HR.' : undefined}
        >
          <TextInput
            value={values.employeeIdCode}
            onChange={(e) => set('employeeIdCode', e.target.value)}
            placeholder="TRACE-104"
            disabled={adminOnly}
          />
        </Field>
        <Field
          label="Joining date"
          hint={adminOnly ? 'Managed by HR.' : undefined}
        >
          <input
            type="date"
            className="input"
            value={values.joiningDate}
            onChange={(e) => set('joiningDate', e.target.value)}
            disabled={adminOnly}
          />
        </Field>
      </div>
      <div className="inv-row">
        <Field
          label="Designation"
          required={isInvite}
          hint={adminOnly ? 'Managed by HR.' : undefined}
        >
          <TextInput
            value={values.designation}
            onChange={(e) => set('designation', e.target.value)}
            placeholder="Software Engineer"
            disabled={adminOnly}
          />
        </Field>
        <Field
          label="Department"
          hint={adminOnly ? 'Managed by HR.' : undefined}
        >
          <TextInput
            value={values.department}
            onChange={(e) => set('department', e.target.value)}
            placeholder="Engineering"
            disabled={adminOnly}
          />
        </Field>
      </div>
      {showCycle && (
        <Field label="Cycle starts in" hint="When the annual 12+12 quota resets.">
          <select
            className="input"
            value={values.cycleStartMonth}
            onChange={(e) => set('cycleStartMonth', Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </Field>
      )}

      {/* Roles */}
      {showRoles && allowedRoles.length > 0 && (
        <>
          <div className="inv-section-label">Roles</div>
          <Field
            label="Assign roles"
            required={isInvite}
            hint="A person can hold more than one role (e.g. a COO who is both Admin and HR)."
          >
            <div className="inv-roles-grid">
              {allowedRoles.map((r) => {
                const checked = values.roles.includes(r);
                return (
                  <label key={r} className={`inv-role-check ${checked ? 'is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(r)}
                    />
                    <span>{ROLE_LABEL[r]}</span>
                  </label>
                );
              })}
            </div>
          </Field>
        </>
      )}
    </div>
  );
}
