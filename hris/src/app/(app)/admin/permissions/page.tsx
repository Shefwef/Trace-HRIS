import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { checkPermission } from '@/lib/permissions';
import { PermissionsMatrix } from '@/screens/admin/PermissionsMatrix';

export const metadata = {
  title: 'Permissions | TRACE HRMS',
};

export default async function Page() {
  const user = await requireUser();
  // HR / Admin / Line Manager can VIEW the matrix (audit.view). Only Super
  // Admin can edit — that check stays on the PATCH endpoint.
  const hasPerm = await checkPermission(user, 'audit.view');
  if (!hasPerm) redirect('/admin');
  return <PermissionsMatrix />;
}
