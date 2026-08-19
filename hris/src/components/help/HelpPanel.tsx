'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle, X, Search, ChevronRight } from 'lucide-react';
import './HelpPanel.css';

interface FAQItem {
  q: string;
  a: string;
  tags: string[]; // categories + keywords for search
  audience: ('EMPLOYEE' | 'HR' | 'ADMIN' | 'SUPER_ADMIN')[];
}

const FAQ: FAQItem[] = [
  {
    q: 'How do I apply for a leave?',
    a: 'From your dashboard or the "My Leaves" page, click the blue "Apply for Leave" button. Follow the 5 steps: pick the type (Casual / Sick / Replacement), choose dates (you can also pick a half-day or a specific time slot), add a reason, choose email + in-app, and review the auto-generated message before submitting. HR gets notified immediately.',
    tags: ['leave', 'apply', 'submit', 'request', 'time-range', 'half-day'],
    audience: ['EMPLOYEE', 'HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'How do I take a partial-day leave (like just the morning)?',
    a: 'In the leave application flow, on Step 2 (Dates), pick a single-day date. You\'ll see two toggles below: "Half day" (Morning / Afternoon) or "Specific time slot within the day" (e.g. 09:00–13:00). Only one can be active at a time. The duration auto-updates as a fraction of your 8-hour day.',
    tags: ['leave', 'half-day', 'partial', 'time slot', 'morning', 'afternoon'],
    audience: ['EMPLOYEE', 'HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'How do I cancel a leave I already submitted?',
    a: 'Go to "My Leaves". Any request still marked "Pending" has a small Cancel button in the last column. Once approved, only HR can reverse it — reach out via chat or email.',
    tags: ['leave', 'cancel', 'pending'],
    audience: ['EMPLOYEE', 'HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'Where do I see the credentials for a new employee I invited?',
    a: 'After clicking "Create account" in the Invite modal, HRIS shows the initial password on the success screen. Copy the whole block with the "Copy all credentials" button and share it with the new employee. They can change their password after signing in via the avatar menu → Manage account.',
    tags: ['invite', 'employee', 'password', 'onboarding', 'credentials'],
    audience: ['HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'How do I clock in?',
    a: 'On your dashboard the big blue "Clock In" button starts your session. Timer counts up live. Start / end breaks with the buttons that appear. Clock Out when your day is done — you\'ll see a session summary with total worked, break, and overtime.',
    tags: ['attendance', 'clock', 'clock-in', 'clock-out', 'break'],
    audience: ['EMPLOYEE', 'HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'I worked on a weekend / holiday — how do I get compensated?',
    a: 'Go to Attendance → "Log extra work day". Pick the date and the slot you covered (Full day = +1 replacement leave day, Half day = +0.5). HR or Admin reviews and approves. Once approved, your replacement leave balance updates automatically and you can apply for a Replacement leave from the usual application flow.',
    tags: ['attendance', 'extra work', 'replacement leave', 'weekend', 'holiday'],
    audience: ['EMPLOYEE', 'HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'How do I approve a leave request?',
    a: 'Sidebar → "Leave Requests". Click any Pending row to open the Review Drawer. You can:\n• Approve as-is (single click)\n• Reject with a reason\n• Modify: click the "Modify" toggle in the "Approval allocation" section. You can change any day to half-day, drop days, or add days beyond what was requested. The button label updates to show the new total (e.g. "Approve (1.5 d)").',
    tags: ['approve', 'reject', 'review', 'leave', 'modify', 'allocation'],
    audience: ['HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'How do I add a public holiday?',
    a: 'Admin sidebar → "Holiday Manager" → "New holiday". Fill in name, date, optional description, and recipients (usually All employees). Save. Then click "Send notice" to email + in-app the announcement to everyone.',
    tags: ['holiday', 'create', 'send notice', 'email'],
    audience: ['HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'How do I change the email address HRIS sends from?',
    a: 'Admin sidebar → Settings → Sender email section. Change "Reply-to email" (where responses come back to) or "From address" (needs to be verified in Resend first). Click Save at the top. Takes effect immediately for the next email sent.',
    tags: ['settings', 'sender', 'email', 'from', 'reply-to'],
    audience: ['HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'What is the difference between Admin and HR?',
    a: 'HR handles day-to-day people ops (approvals, invites, holidays). Admin is for CEO/CTO — same operational powers as HR plus they receive CCs on leave requests. Super Admin is the technical owner (you) with access to audit logs and system-level config.',
    tags: ['roles', 'permissions', 'admin', 'hr', 'super admin'],
    audience: ['EMPLOYEE', 'HR', 'ADMIN', 'SUPER_ADMIN'],
  },
  {
    q: 'I forgot my password — how do I reset it?',
    a: 'On the sign-in page, click "Forgot password?" and follow the emailed link. If you don\'t receive the email within a couple of minutes, check spam. If still nothing, ping HR to trigger a fresh invitation.',
    tags: ['password', 'reset', 'forgot', 'sign in'],
    audience: ['EMPLOYEE', 'HR', 'ADMIN', 'SUPER_ADMIN'],
  },
];

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (!q.trim()) return FAQ;
    const needle = q.toLowerCase();
    return FAQ.filter(
      (f) =>
        f.q.toLowerCase().includes(needle) ||
        f.a.toLowerCase().includes(needle) ||
        f.tags.some((t) => t.includes(needle))
    );
  }, [q]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <button
        className="help-fab"
        onClick={() => setOpen(true)}
        aria-label="Open help panel"
      >
        <HelpCircle size={22} />
        <span>Help</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="help-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="help-panel"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Help panel"
            >
              <header className="help-header">
                <div>
                  <div className="help-eyebrow">HELP CENTER</div>
                  <h2>How can we help?</h2>
                </div>
                <button className="help-close" onClick={() => setOpen(false)} aria-label="Close">
                  <X size={20} />
                </button>
              </header>

              <div className="help-search">
                <Search size={16} />
                <input
                  autoFocus
                  placeholder="Search for a topic (e.g. leave, holiday, invite)…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              <div className="help-list">
                {matches.length === 0 && (
                  <div className="help-empty">
                    Nothing matches &quot;{q}&quot;. Try a different word, or reach out to
                    HR at <a href="mailto:shefadib@gmail.com">shefadib@gmail.com</a>.
                  </div>
                )}
                {matches.map((f) => {
                  const isOpen = expanded === f.q;
                  return (
                    <div key={f.q} className={`help-item ${isOpen ? 'help-item-open' : ''}`}>
                      <button
                        className="help-item-q"
                        onClick={() => setExpanded(isOpen ? null : f.q)}
                      >
                        <span>{f.q}</span>
                        <ChevronRight size={16} className="help-item-chev" />
                      </button>
                      {isOpen && (
                        <div className="help-item-a">{f.a}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <footer className="help-footer">
                Still stuck? Email{' '}
                <a href="mailto:shefadib@gmail.com">shefadib@gmail.com</a>.
              </footer>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
