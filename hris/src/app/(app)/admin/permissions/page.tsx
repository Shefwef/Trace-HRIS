import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { PermissionsMatrix } from '@/screens/admin/PermissionsMatrix';

export const metadata = {
  title: 'Permissions | Trace HRIS',
};

export default async function Page() {
  const user = await requireUser();
  if (user.role !== 'SUPER_ADMIN') redirect('/admin');
  return <PermissionsMatrix />;
}
