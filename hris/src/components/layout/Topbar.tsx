import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, ChevronDown, LogOut, UserCog, Users2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser, useStore } from '../../lib/store';
import { Avatar } from '../ui/Avatar';
import { fmtRelative, cx } from '../../lib/utils';
import { CheckCircle2, XCircle, Clock as ClockIcon, Star, CalendarDays, Bell as BellIcon, Info } from 'lucide-react';
import './Topbar.css';

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  LEAVE_APPROVED: <CheckCircle2 size={16} color="var(--color-success)" />,
  LEAVE_REJECTED: <XCircle size={16} color="var(--color-danger)" />,
  LEAVE_PENDING: <ClockIcon size={16} color="var(--color-warning)" />,
  REPLACEMENT_EARNED: <Star size={16} color="var(--color-brand-accent)" />,
  HOLIDAY_NOTICE: <CalendarDays size={16} color="var(--color-brand-primary)" />,
  ATTENDANCE_REMINDER: <BellIcon size={16} color="var(--color-info)" />,
  SYSTEM: <Info size={16} color="var(--color-text-muted)" />,
};

export function Topbar() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const users = useStore((s) => s.users);
  const switchUser = useStore((s) => s.switchUser);
  const logout = useStore((s) => s.logout);
  const allNotifications = useStore((s) => s.notifications);
  const notifications = useMemo(
    () => allNotifications.filter((n) => n.recipientId === user?.id),
    [allNotifications, user?.id]
  );
  const markRead = useStore((s) => s.markNotificationRead);
  const markAllRead = useStore((s) => s.markAllRead);

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const switchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node))
        setUserOpen(false);
      if (switchRef.current && !switchRef.current.contains(e.target as Node))
        setSwitcherOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) return null;
  const unread = notifications.filter((n) => !n.isRead).length;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-greet">
          Hello, <strong>{user.fullName.split(' ')[0]}</strong>
        </div>
        <div className="topbar-date">{today}</div>
      </div>

      <div className="topbar-right">
        {/* Role/user switcher */}
        <div className="topbar-switcher" ref={switchRef}>
          <button
            className="topbar-btn topbar-btn-outline"
            onClick={() => setSwitcherOpen((v) => !v)}
          >
            <Users2 size={16} />
            <span className="hide-sm">Demo: switch user</span>
            <ChevronDown size={14} />
          </button>
          <AnimatePresence>
            {switcherOpen && (
              <motion.div
                className="topbar-menu topbar-menu-wide"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <div className="topbar-menu-header">
                  Switch account (demo only)
                </div>
                {users.map((u) => (
                  <button
                    key={u.id}
                    className={cx(
                      'topbar-menu-user',
                      u.id === user.id && 'topbar-menu-user-active'
                    )}
                    onClick={() => {
                      switchUser(u.id);
                      setSwitcherOpen(false);
                      if (u.role === 'ADMIN') navigate('/admin');
                      else navigate('/');
                    }}
                  >
                    <Avatar initials={u.initials} color={u.avatarColor} size="sm" />
                    <div className="topbar-menu-user-body">
                      <div className="topbar-menu-user-name">{u.fullName}</div>
                      <div className="topbar-menu-user-role">
                        {u.role === 'ADMIN' ? 'Admin' : u.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Employee'} • {u.designation}
                      </div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications */}
        <div className="topbar-notif" ref={notifRef}>
          <button
            className="topbar-icon-btn"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unread > 0 && <span className="topbar-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div
                className="topbar-menu topbar-menu-notif"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <div className="topbar-menu-header">
                  <span>Notifications</span>
                  {unread > 0 && (
                    <button
                      className="topbar-menu-link"
                      onClick={() => markAllRead(user.id)}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="topbar-notif-list">
                  {notifications.length === 0 ? (
                    <div className="topbar-notif-empty">
                      You're all caught up.
                    </div>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <button
                        key={n.id}
                        className={cx(
                          'topbar-notif-item',
                          !n.isRead && 'topbar-notif-unread'
                        )}
                        onClick={() => markRead(n.id)}
                      >
                        <span className="topbar-notif-icon">
                          {NOTIF_ICONS[n.type] ?? NOTIF_ICONS.SYSTEM}
                        </span>
                        <div className="topbar-notif-body">
                          <div className="topbar-notif-title">{n.title}</div>
                          <div className="topbar-notif-text">{n.body}</div>
                          <div className="topbar-notif-time">{fmtRelative(n.createdAt)}</div>
                        </div>
                        {!n.isRead && <span className="topbar-notif-dot" />}
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User menu */}
        <div className="topbar-user" ref={userRef}>
          <button className="topbar-userbtn" onClick={() => setUserOpen((v) => !v)}>
            <Avatar initials={user.initials} color={user.avatarColor} size="sm" />
            <div className="topbar-user-info hide-sm">
              <div className="topbar-user-name">{user.fullName}</div>
              <div className="topbar-user-role">{user.designation}</div>
            </div>
            <ChevronDown size={14} />
          </button>
          <AnimatePresence>
            {userOpen && (
              <motion.div
                className="topbar-menu"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <div className="topbar-menu-user-card">
                  <Avatar initials={user.initials} color={user.avatarColor} size="lg" />
                  <div>
                    <div className="topbar-menu-user-name">{user.fullName}</div>
                    <div className="topbar-menu-user-role">{user.email}</div>
                  </div>
                </div>
                <div className="topbar-menu-divider" />
                <button className="topbar-menu-item">
                  <UserCog size={14} />
                  Account settings
                </button>
                <button
                  className="topbar-menu-item topbar-menu-danger"
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
