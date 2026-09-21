'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { useInviteEmployee } from '@/lib/hooks';
import { useCurrentUser } from '@/lib/session';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { EmployeeProfileForm, type ProfileFormValues, type Role } from './EmployeeProfileForm';
import './InviteEmployeeModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

function invitableRoles(actorRole: string | undefined): Role[] {
  if (actorRole === 'SUPER_ADMIN' || actorRole === 'ADMIN')
    return ['SUPER_ADMIN', 'ADMIN', 'HR', 'LINE_MANAGER', 'EMPLOYEE'];
  if (actorRole === 'HR') return ['HR', 'LINE_MANAGER', 'EMPLOYEE'];
  return [];
}

const EMPTY: ProfileFormValues = {
  firstName: '', lastName: '', email: '', phone: '',
  dateOfBirth: '', avatarUrl: '',
  employeeIdCode: '', joiningDate: '',
  designation: '', department: '',
  cycleStartMonth: 1,
  roles: ['EMPLOYEE'],
};

export function InviteEmployeeModal({ open, onClose }: Props) {
  const actor = useCurrentUser();
  const allowedRoles = invitableRoles(actor?.role);
  const invite = useInviteEmployee();

  const [values, setValues] = useState<ProfileFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function patchValues(patch: Partial<ProfileFormValues>) {
    setValues((v) => ({ ...v, ...patch }));
  }

  function reset() {
    setValues(EMPTY);
    setError(null); setResult(null); setCopied(false);
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }

  function submit() {
    if (!values.email || !values.firstName || !values.designation || !values.employeeIdCode) return;
    if (values.roles.length === 0) {
      setError('Pick at least one role for the new employee.');
      return;
    }
    setError(null);
    invite.mutate(
      {
        email: values.email.trim(),
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim() || undefined,
        roles: values.roles,
        department: values.department.trim() || undefined,
        designation: values.designation.trim(),
        employeeIdCode: values.employeeIdCode.trim(),
        cycleStartMonth: values.cycleStartMonth,
        phone: values.phone.trim() || undefined,
        dateOfBirth: values.dateOfBirth || undefined,
        joiningDate: values.joiningDate || undefined,
        avatarUrl: values.avatarUrl.trim() || undefined,
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
    values.email && values.firstName && values.designation && values.employeeIdCode &&
    values.roles.length > 0 && !invite.isPending;

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
            needed. If Clerk offers &quot;Email code&quot; on the sign-in page, they
            should skip it and use the password field instead — a code email
            may be delayed or filtered by their corporate spam rules.
          </div>
        </motion.div>
      ) : (
        <>
          <EmployeeProfileForm
            mode="invite"
            values={values}
            onChange={patchValues}
            allowedRoles={allowedRoles}
          />
          {error && <div className="inv-error" style={{ marginTop: 12 }}>{error}</div>}
        </>
      )}
    </Modal>
  );
}
