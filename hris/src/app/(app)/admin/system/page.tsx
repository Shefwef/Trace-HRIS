import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { SystemConfig } from '@/screens/admin/SystemConfig';

export default async function Page() {
  const user = await requireUser();
  if (user.role !== 'SUPER_ADMIN') redirect('/admin');
  return <SystemConfig />;
}
