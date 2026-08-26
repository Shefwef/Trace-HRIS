import { ensureUserInDb } from '@/lib/auth';
import { AppShell } from '@/components/layout/AppShell';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await ensureUserInDb();
  if (!user) redirect('/sign-in');

  return (
    <AppShell
      user={{
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        roles: user.roles?.length ? user.roles : [user.role],
        department: user.department ?? '',
        designation: user.designation ?? '',
        employeeIdCode: user.employeeIdCode ?? '',
        avatarUrl: user.avatarUrl ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
