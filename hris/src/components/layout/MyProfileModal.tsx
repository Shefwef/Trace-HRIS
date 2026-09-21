'use client';
import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { EmployeeProfileForm, type ProfileFormValues } from '../admin/EmployeeProfileForm';
import { useCurrentUser } from '@/lib/session';
import { useUpdateEmployee, useUsers } from '@/lib/hooks';
import { useStore } from '@/lib/store';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMPTY: ProfileFormValues = {
  firstName: '', lastName: '', email: '', phone: '',
  dateOfBirth: '', avatarUrl: '',
  employeeIdCode: '', joiningDate: '',
  designation: '', department: '',
  cycleStartMonth: 1,
  roles: [],
};

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

/**
 * Self-service profile edit. Uses the same form as Invite / admin Edit
 * Profile — the shared form disables admin-only fields (employee ID,
 * designation, department, joining date) so they render as read-only
 * context but can't be changed.
 */
export function MyProfileModal({ open, onClose }: Props) {
  const me = useCurrentUser();
  const { data: users } = useUsers();
  const update = useUpdateEmployee();
  const addToast = useStore((s) => s.addToast);
  const [values, setValues] = useState<ProfileFormValues>(EMPTY);

  // Hydrate from the fresh user record whenever the modal opens.
  useEffect(() => {
    if (!open || !me) return;
    const record = users?.find((u) => u.id === me.id);
    const source = record ?? {
      fullName: me.fullName, email: me.email,
      phone: null, dateOfBirth: null, joiningDate: null,
      avatarUrl: me.avatarUrl, department: null, designation: null,
      employeeIdCode: null,
    };
    const { firstName, lastName } = splitName(source.fullName);
    setValues({
      firstName, lastName,
      email: source.email,
      phone: source.phone ?? '',
      dateOfBirth: source.dateOfBirth ? source.dateOfBirth.slice(0, 10) : '',
      avatarUrl: source.avatarUrl ?? '',
      employeeIdCode: source.employeeIdCode ?? '',
      joiningDate: source.joiningDate ? source.joiningDate.slice(0, 10) : '',
      designation: source.designation ?? '',
      department: source.department ?? '',
      cycleStartMonth: 1,
      roles: [],
    });
  }, [open, me, users]);

  function submit() {
    if (!me) return;
    const fullName = `${values.firstName} ${values.lastName}`.trim();
    if (fullName.length < 2) {
      addToast({ kind: 'error', title: 'Please enter your name.' });
      return;
    }
    update.mutate(
      {
        id: me.id,
        patch: {
          fullName,
          phone: values.phone.trim() || undefined,
          dateOfBirth: values.dateOfBirth || undefined,
          avatarUrl: values.avatarUrl.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          addToast({ kind: 'success', title: 'Profile updated' });
          onClose();
        },
        onError: (e: Error) =>
          addToast({ kind: 'error', title: 'Could not update profile', body: e.message }),
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="My profile"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={update.isPending} onClick={submit}>
            Save changes
          </Button>
        </>
      }
    >
      <EmployeeProfileForm
        mode="edit-self"
        values={values}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
      />
    </Modal>
  );
}
