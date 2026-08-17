import { NavLink, useLocation } from 'react-router-dom';
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
import { useCurrentUser } from '../../lib/store';
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
  const location = useLocation();

  useEffect(() => {
    closeMobile();
  }, [location.pathname, closeMobile]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  if (!user) return null;

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  const nav = (
    <>
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <rect width="32" height="32" rx="8" fill="url(#g1)" />
            <circle cx="16" cy="13" r="5" fill="white" />
            <path d="M6 27c0-5 4.5-9 10-9s10 4 10 9" fill="white" />
            <defs>
              <linearGradient id="g1" x1="0" x2="32" y1="0" y2="32">
                <stop stopColor="#2C5282" />
                <stop offset="1" stopColor="#3182CE" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-name">HRIS</div>
          <div className="sidebar-brand-tag">People, simplified.</div>
        </div>
        <button
          className="sidebar-close"
          onClick={closeMobile}
          aria-label="Close menu"
        >
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
  return (
    <NavLink
      to={to}
      end={to === '/' || to === '/admin'}
      className={({ isActive }) => cx('sidebar-item', isActive && 'sidebar-item-active')}
    >
      <span className="sidebar-item-icon">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}
