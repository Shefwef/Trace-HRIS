import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { AuditLog } from '@/screens/admin/AuditLog';

export default async function Page() {
  const user = await requireUser();
  if (user.role !== 'SUPER_ADMIN') redirect('/admin');
  return <AuditLog />;
}
