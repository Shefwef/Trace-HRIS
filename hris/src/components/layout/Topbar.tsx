'use client';
import { useState, useRef, useEffect } from 'react';
import { Bell, ChevronDown, LogOut, UserCog, Menu, CheckCircle2, XCircle, Clock as ClockIcon, Star, CalendarDays, Info, User as UserIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCurrentUser, initials, avatarColorFor } from '@/lib/session';
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '@/lib/hooks';
import { notificationHref } from '@/lib/notificationHref';
import { Avatar } from '../ui/Avatar';
import { cx, fmtRelative } from '../../lib/utils';
import { useMobileNav } from './navContext';
import { MyProfileModal } from './MyProfileModal';
import './Topbar.css';

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  LEAVE_APPROVED: <CheckCircle2 size={16} color="var(--color-success)" />,
  LEAVE_REJECTED: <XCircle size={16} color="var(--color-danger)" />,
  LEAVE_PENDING: <ClockIcon size={16} color="var(--color-warning)" />,
  EXTRA_WORK_APPROVED: <CheckCircle2 size={16} color="var(--color-success)" />,
  EXTRA_WORK_REJECTED: <XCircle size={16} color="var(--color-danger)" />,
  EXTRA_WORK_PENDING: <ClockIcon size={16} color="var(--color-warning)" />,
  REPLACEMENT_EARNED: <Star size={16} color="var(--color-brand-accent)" />,
  HOLIDAY_NOTICE: <CalendarDays size={16} color="var(--color-brand-primary)" />,
  SYSTEM: <Info size={16} color="var(--color-text-muted)" />,
};

export function Topbar() {
  const router = useRouter();
  const { signOut, openUserProfile } = useClerk();
  const user = useCurrentUser();

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const openMobileNav = useMobileNav((s) => s.open);
  const { data: notif } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) return null;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const shortDate = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const userInitials = initials(user.fullName);
  const userColor = avatarColorFor(user.id);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="topbar-hamburger" onClick={openMobileNav} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className="topbar-left-text">
          <div className="topbar-greet">
            Hello, <strong>{user.fullName.split(' ')[0]}</strong>
          </div>
          <div className="topbar-date topbar-date-full">{today}</div>
          <div className="topbar-date topbar-date-short">{shortDate}</div>
        </div>
      </div>

      <div className="topbar-right">
        {/* Notifications — TODO: wire to /api/notifications */}
        <div className="topbar-notif" ref={notifRef}>
          <button
            className="topbar-icon-btn"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
          >
            <Bell size={18} />
            {(notif?.unread ?? 0) > 0 && (
              <span className="topbar-badge">{notif!.unread > 9 ? '9+' : notif!.unread}</span>
            )}
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
                  {(notif?.unread ?? 0) > 0 && (
                    <button className="topbar-menu-link" onClick={() => markAllRead.mutate()}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="topbar-notif-list">
                  {!notif || notif.items.length === 0 ? (
                    <div className="topbar-notif-empty">You&apos;re all caught up.</div>
                  ) : (
                    notif.items.slice(0, 10).map((n) => (
                      <Link
                        key={n.id}
                        href={notificationHref(n)}
                        prefetch={false}
                        className={cx('topbar-notif-item', !n.isRead && 'topbar-notif-unread')}
                        onClick={() => {
                          if (!n.isRead) markRead.mutate(n.id);
                          setNotifOpen(false);
                        }}
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
                      </Link>
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
            <Avatar
              initials={userInitials}
              color={userColor}
              size="sm"
              imageUrl={user.avatarUrl}
              alt={user.fullName}
            />
            <div className="topbar-user-info hide-sm">
              <div className="topbar-user-name">{user.fullName}</div>
              <div className="topbar-user-role">
                {user.designation || user.role.toLowerCase().replace('_', ' ')}
              </div>
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
                  <Avatar
                    initials={userInitials}
                    color={userColor}
                    size="lg"
                    imageUrl={user.avatarUrl}
                    alt={user.fullName}
                  />
                  <div>
                    <div className="topbar-menu-user-name">{user.fullName}</div>
                    <div className="topbar-menu-user-role">{user.email}</div>
                  </div>
                </div>
                <div className="topbar-menu-divider" />
                <button
                  className="topbar-menu-item"
                  onClick={() => {
                    setUserOpen(false);
                    setProfileOpen(true);
                  }}
                >
                  <UserIcon size={14} />
                  My profile
                </button>
                <button
                  className="topbar-menu-item"
                  onClick={() => {
                    setUserOpen(false);
                    openUserProfile();
                  }}
                >
                  <UserCog size={14} />
                  Account settings
                </button>
                <button
                  className="topbar-menu-item topbar-menu-danger"
                  onClick={async () => {
                    await signOut();
                    router.push('/sign-in');
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
      <MyProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}

export { cx };
