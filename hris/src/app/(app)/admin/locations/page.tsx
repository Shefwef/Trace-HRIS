import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { checkPermission } from '@/lib/permissions';
import { WorkLocations } from '@/screens/admin/WorkLocations';

export const metadata = {
  title: 'Work Locations | TRACE HRMS',
};

export default async function Page() {
  const user = await requireUser();
  // Line Managers reach this page too — the board API narrows the rows to their
  // direct reports, so the gate here only asks "may you see anyone at all".
  const canView =
    (await checkPermission(user, 'work_location.view_all')) ||
    (await checkPermission(user, 'work_location.view_team'));
  if (!canView) redirect('/');
  return <WorkLocations />;
}
