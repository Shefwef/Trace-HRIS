'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { useInviteEmployee } from '@/lib/hooks';
import { useCurrentUser } from '@/lib/session';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, TextInput } from '../ui/Field';
import './InviteEmployeeModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'LINE_MANAGER' | 'EMPLOYEE';

// Which roles the inviter can grant on this new account. Mirrors the
// server-side hierarchy in /api/users/[id]/route.ts.
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

export function InviteEmployeeModal({ open, onClose }: Props) {
  const actor = useCurrentUser();
  const allowedRoles = invitableRoles(actor?.role);
  const invite = useInviteEmployee();

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roles, setRoles] = useState<Role[]>(['EMPLOYEE']);
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [employeeIdCode, setEmployeeIdCode] = useState('');
  const [cycleStartMonth, setCycleStartMonth] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setEmail(''); setFirstName(''); setLastName(''); setRoles(['EMPLOYEE']);
    setDepartment(''); setDesignation(''); setEmployeeIdCode('');
    setCycleStartMonth(1); setError(null); setResult(null); setCopied(false);
  }

  function toggleRoleAt(r: Role) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }

  function submit() {
    if (!email || !firstName || !lastName || !department || !designation || !employeeIdCode) return;
    if (roles.length === 0) {
      setError('Pick at least one role for the new employee.');
      return;
    }
    setError(null);
    invite.mutate(
      {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        roles,
        department: department.trim(),
        designation: designation.trim(),
        employeeIdCode: employeeIdCode.trim(),
        cycleStartMonth,
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
    email && firstName && lastName && department && designation && employeeIdCode && roles.length > 0 && !invite.isPending;

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
          <div className="inv-row">
            <Field label="First name" required>
              <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last name" required>
              <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>

          <Field label="Work email" required hint="They'll use this to sign in.">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane.doe@company.com" />
          </Field>

          <div className="inv-row">
            <Field label="Employee ID" required>
              <TextInput value={employeeIdCode} onChange={(e) => setEmployeeIdCode(e.target.value)} placeholder="TRACE-104" />
            </Field>
            <Field label="Cycle starts in" hint="When the annual 12+12 quota resets.">
              <select
                className="input"
                value={cycleStartMonth}
                onChange={(e) => setCycleStartMonth(Number(e.target.value))}
              >
                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <Field label="Roles" required hint="A person can hold more than one role (e.g. a COO who is both Admin and HR).">
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
          </div>

          <div className="inv-row">
            <Field label="Department" required>
              <TextInput value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering" />
            </Field>
            <Field label="Designation" required>
              <TextInput value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Software Engineer" />
            </Field>
          </div>

          {error && <div className="inv-error">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
