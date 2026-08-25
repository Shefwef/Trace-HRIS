import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { LeaveRequestsPage } from '@/screens/admin/LeaveRequests';

export default async function Page() {
  const user = await requireUser();
  const roles = user.roles.length > 0 ? user.roles : [user.role];
  // Line Managers reach this page too — the API scopes the queue to their team.
  const canReview =
    roles.includes('SUPER_ADMIN') ||
    roles.includes('ADMIN') ||
    roles.includes('HR') ||
    roles.includes('LINE_MANAGER');
  if (!canReview) redirect('/');
  return <LeaveRequestsPage />;
}
