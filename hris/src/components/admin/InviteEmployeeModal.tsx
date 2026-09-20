'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { useInviteEmployee } from '@/lib/hooks';
import { useCurrentUser } from '@/lib/session';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, TextInput } from '../ui/Field';
import { AvatarUpload } from '../ui/AvatarUpload';
import './InviteEmployeeModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'LINE_MANAGER' | 'EMPLOYEE';

function invitableRoles(actorRole: string | undefined): Role[] {
  if (actorRole === 'SUPER_ADMIN' || actorRole === 'ADMIN')
    return ['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'];
  if (actorRole === 'HR') return ['HR', 'LINE_MANAGER', 'EMPLOYEE'];
  return [];
}

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

export function InviteEmployeeModal({ open, onClose }: Props) {
  const actor = useCurrentUser();
  const allowedRoles = invitableRoles(actor?.role);
  const invite = useInviteEmployee();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [employeeIdCode, setEmployeeIdCode] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [cycleStartMonth, setCycleStartMonth] = useState(1);
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [roles, setRoles] = useState<Role[]>(['EMPLOYEE']);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setFirstName(''); setLastName(''); setEmail(''); setPhone('');
    setDateOfBirth(''); setAvatarUrl(''); setEmployeeIdCode('');
    setJoiningDate(''); setCycleStartMonth(1);
    setDepartment(''); setDesignation(''); setRoles(['EMPLOYEE']);
    setError(null); setResult(null); setCopied(false);
  }

  function toggleRoleAt(r: Role) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }

  function submit() {
    if (!email || !firstName || !designation || !employeeIdCode) return;
    if (roles.length === 0) {
      setError('Pick at least one role for the new employee.');
      return;
    }
    setError(null);
    invite.mutate(
      {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        roles,
        department: department.trim() || undefined,
        designation: designation.trim(),
        employeeIdCode: employeeIdCode.trim(),
        cycleStartMonth,
        phone: phone.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        joiningDate: joiningDate || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
      },
      {
        onSuccess: (data) => setResult({ email: data.email, password: data.initialPassword }),
        onError: (e: Error) => setError(e.message),
      }
    );
  }

  async function copyCredentials() {
    if (!result) return;
    await navigator.clipboard.writeText(
      `Sign in URL: ${window.location.origin}/sign-in\nEmail: ${result.email}\nPassword: ${result.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  const canSubmit =
    email && firstName && designation && employeeIdCode && roles.length > 0 && !invite.isPending;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={result ? 'Employee invited' : 'Invite a new employee'}
      size="lg"
      footer={
        result ? (
          <Button variant="primary" onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={invite.isPending}
              disabled={!canSubmit}
              onClick={submit}
            >
              Create account
            </Button>
          </>
        )
      }
    >
      {result ? (
        <motion.div
          className="inv-success"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r="30" fill="var(--color-success-light)" />
            <motion.path
              d="M20 33 L29 42 L45 24"
              fill="none"
              stroke="var(--color-success)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            />
          </svg>
          <h3>Account created</h3>
          <p>Share these credentials with the new employee. They can change their password from their profile after signing in.</p>
          <div className="inv-creds">
            <div className="inv-cred-row">
              <span>Sign-in URL</span>
              <strong className="mono">{typeof window !== 'undefined' ? window.location.origin + '/sign-in' : '/sign-in'}</strong>
            </div>
            <div className="inv-cred-row">
              <span>Email</span>
              <strong className="mono">{result.email}</strong>
            </div>
            <div className="inv-cred-row inv-cred-highlight">
              <span>Initial password</span>
              <strong className="mono">{result.password}</strong>
            </div>
          </div>
          <Button
            variant="secondary"
            leadingIcon={copied ? <Check size={14} /> : <Copy size={14} />}
            onClick={copyCredentials}
            fullWidth
          >
            {copied ? 'Copied!' : 'Copy all credentials'}
          </Button>
          <div className="inv-signin-note">
            <strong>Tell them to sign in with email + password.</strong> Their
            email is pre-verified in the system, so no verification code is
            needed. If Clerk offers "Email code" on the sign-in page, they
            should skip it and use the password field instead — a code email
            may be delayed or filtered by their corporate spam rules.
          </div>
        </motion.div>
      ) : (
        <div className="inv-form">
          {/* Personal info */}
          <div className="inv-section-label">Personal info</div>
          <div className="inv-row">
            <Field label="First name" required>
              <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last name">
              <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>
          <div className="inv-row">
            <Field label="Official email" required hint="They'll use this to sign in.">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane.doe@company.com" />
            </Field>
            <Field label="Phone number">
              <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+880 17xx xxxxxx" />
            </Field>
          </div>
          <Field label="Birthday">
            <input
              type="date"
              className="input"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </Field>
          <Field label="Profile picture">
            <AvatarUpload
              value={avatarUrl}
              name={`${firstName} ${lastName}`.trim() || 'New Employee'}
              onChange={setAvatarUrl}
            />
          </Field>

          {/* Employment details */}
          <div className="inv-section-label">Employment</div>
          <div className="inv-row">
            <Field label="Employee ID" required>
              <TextInput value={employeeIdCode} onChange={(e) => setEmployeeIdCode(e.target.value)} placeholder="TRACE-104" />
            </Field>
            <Field label="Joining date">
              <input
                type="date"
                className="input"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="inv-row">
            <Field label="Designation" required>
              <TextInput value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Software Engineer" />
            </Field>
            <Field label="Department">
              <TextInput value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering" />
            </Field>
          </div>
          <Field label="Cycle starts in" hint="When the annual 12+12 quota resets.">
            <select
              className="input"
              value={cycleStartMonth}
              onChange={(e) => setCycleStartMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>

          {/* Roles */}
          <div className="inv-section-label">Roles</div>
          <Field label="Assign roles" required hint="A person can hold more than one role (e.g. a COO who is both Admin and HR).">
            <div className="inv-roles-grid">
              {allowedRoles.map((r) => {
                const checked = roles.includes(r);
                return (
                  <label key={r} className={`inv-role-check ${checked ? 'is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRoleAt(r)}
                    />
                    <span>{ROLE_LABEL[r]}</span>
                  </label>
                );
              })}
            </div>
          </Field>

          {error && <div className="inv-error">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
