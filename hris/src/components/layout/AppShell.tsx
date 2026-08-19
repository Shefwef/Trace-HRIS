'use client';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ToastHost } from '../ui/Toasts';
import { HelpPanel } from '../help/HelpPanel';
import { useCurrentUserSync, type SessionUser } from '@/lib/session';
import './AppShell.css';

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  useCurrentUserSync(user);
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        <Topbar />
        <main className="shell-content">{children}</main>
      </div>
      <ToastHost />
      <HelpPanel />
    </div>
  );
}
