import { redirect } from 'next/navigation';
import { ensureUserInDb } from '@/lib/auth';
import { checkPermission } from '@/lib/permissions';
import { BiometricAdmin } from '@/screens/admin/BiometricAdmin';

export default async function Page() {
  const user = await ensureUserInDb();
  if (!user) redirect('/sign-in');

  const hasPerm = await checkPermission(user, 'biometric.view');
  if (!hasPerm) redirect('/admin');

  return <BiometricAdmin />;
}
