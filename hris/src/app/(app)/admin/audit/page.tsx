import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { checkPermission } from '@/lib/permissions';
import { AuditLog } from '@/screens/admin/AuditLog';

export default async function Page() {
  const user = await requireUser();
  const hasPerm = await checkPermission(user, 'audit.view');
  if (!hasPerm) redirect('/admin');
  return <AuditLog />;
}
