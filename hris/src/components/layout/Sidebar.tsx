'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Home,
  ClipboardList,
  Clock,
  Calendar,
  BarChart3,
  FileText,
  Users,
  Inbox,
  CalendarDays,
  Settings,
  Cog,
  ScrollText,
  X,
} from 'lucide-react';
import { useCurrentUser } from '@/lib/session';
import { useMobileNav } from './navContext';
import { cx } from '../../lib/utils';
import './Sidebar.css';

const employeeNav = [
  { to: '/', label: 'Home', icon: <Home size={18} /> },
  { to: '/leaves', label: 'My Leaves', icon: <ClipboardList size={18} /> },
  { to: '/attendance', label: 'Attendance', icon: <Clock size={18} /> },
  { to: '/calendar', label: 'Calendar', icon: <Calendar size={18} /> },
  { to: '/analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
  { to: '/reports', label: 'Reports', icon: <FileText size={18} /> },
];

const adminNav = [
  { to: '/admin', label: 'Admin Home', icon: <Home size={18} /> },
  { to: '/admin/requests', label: 'Leave Requests', icon: <Inbox size={18} /> },
  { to: '/admin/employees', label: 'Employees', icon: <Users size={18} /> },
  { to: '/admin/holidays', label: 'Holiday Manager', icon: <CalendarDays size={18} /> },
  { to: '/admin/settings', label: 'Settings', icon: <Settings size={18} /> },
];

const superNav = [
  { to: '/admin/system', label: 'System Config', icon: <Cog size={18} /> },
  { to: '/admin/audit', label: 'Audit Logs', icon: <ScrollText size={18} /> },
];

export function Sidebar() {
  const user = useCurrentUser();
  const mobileOpen = useMobileNav((s) => s.mobileOpen);
  const closeMobile = useMobileNav((s) => s.close);
  const pathname = usePathname();

  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  if (!user) return null;

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'HR';

  const nav = (
    <>
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img
            src="/Trace%20Consulting%20Logo.png"
            alt="Trace Consulting"
            width={26}
            height={26}
          />
        </div>
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-name">HRIS</div>
          <div className="sidebar-brand-tag">People, simplified.</div>
        </div>
        <button className="sidebar-close" onClick={closeMobile} aria-label="Close menu">
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">Workspace</div>
        {employeeNav.map((item) => (
          <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
        ))}

        {isAdmin && (
          <>
            <div className="sidebar-section">Administration</div>
            {adminNav.map((item) => (
              <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
            ))}
          </>
        )}

        {user.role === 'SUPER_ADMIN' && (
          <>
            <div className="sidebar-section">Super Admin</div>
            {superNav.map((item) => (
              <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
            ))}
          </>
        )}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-help">
          <div className="sidebar-help-title">Need help?</div>
          <div className="sidebar-help-body">
            Reach out to HR at <a href="mailto:hr@company.com">hr@company.com</a>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className="sidebar sidebar-desktop">{nav}</aside>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="sidebar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMobile}
            />
            <motion.aside
              className="sidebar sidebar-mobile"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            >
              {nav}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const isActive =
    to === '/' ? pathname === '/' : to === '/admin' ? pathname === '/admin' : pathname.startsWith(to);
  return (
    <Link href={to} className={cx('sidebar-item', isActive && 'sidebar-item-active')}>
      <span className="sidebar-item-icon">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
