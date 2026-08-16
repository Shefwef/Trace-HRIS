import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ToastHost } from '../ui/Toasts';
import './AppShell.css';

export function AppShell(): ReactNode {
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        <Topbar />
        <main className="shell-content">
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
