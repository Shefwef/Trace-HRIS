'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileText, TrendingUp, Users, CalendarClock, Loader2, Check } from 'lucide-react';
import { useCurrentUser } from '@/lib/session';
import { useStore } from '@/lib/store';
import { Button } from '../../components/ui/Button';
import './Reports.css';

type ReportType = 'attendance' | 'leaves' | 'summary' | 'all-employees';

interface ReportDef {
  id: ReportType;
  title: string;
  body: string;
  icon: React.ReactNode;
  accent: string;
  bg: string;
  usesMonth: boolean;
  adminOnly?: boolean;
}

const REPORTS: ReportDef[] = [
  {
    id: 'summary',
    title: 'Performance summary',
    body: 'A one-page snapshot — leave balance, attendance rate, overtime and leave activity for this cycle. Great for reviews.',
    icon: <TrendingUp size={20} />,
    accent: 'var(--color-leave-replacement)',
    bg: 'var(--color-leave-replacement-light)',
    usesMonth: true,
  },
  {
    id: 'attendance',
    title: 'Monthly attendance',
    body: 'Every clock-in, clock-out, break minute and overtime for the month — grouped by day, with a status badge per row.',
    icon: <CalendarClock size={20} />,
    accent: 'var(--color-brand-primary)',
    bg: 'var(--color-info-light)',
    usesMonth: true,
  },
  {
    id: 'leaves',
    title: 'Leave history',
    body: 'Every leave request in the selected cycle — dates, reason, reviewer and decision. Sorted newest-first.',
    icon: <FileText size={20} />,
    accent: 'var(--color-leave-casual)',
    bg: 'var(--color-leave-casual-light)',
    usesMonth: false,
  },
  {
    id: 'all-employees',
    title: 'Company cycle report',
    body: 'HR / Admin only. Every active employee side-by-side — balances, attendance rate this month, pending requests. Landscape A4.',
    icon: <Users size={20} />,
    accent: 'var(--color-warning)',
    bg: 'var(--color-warning-light)',
    usesMonth: true,
    adminOnly: true,
  },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function ReportsPage() {
  const user = useCurrentUser();
  const addToast = useStore((s) => s.addToast);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [busyId, setBusyId] = useState<ReportType | null>(null);
  const [doneId, setDoneId] = useState<ReportType | null>(null);

  if (!user) return null;

  const isAdmin = user.role === 'HR' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const list = REPORTS.filter((r) => !r.adminOnly || isAdmin);

  async function download(r: ReportDef) {
    setBusyId(r.id);
    setDoneId(null);
    try {
      const q = new URLSearchParams({ year: String(year) });
      if (r.usesMonth) q.set('month', String(month));
      const res = await fetch(`/api/reports/${r.id}?${q.toString()}`);
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = (await res.json()) as { message?: string };
          if (j.message) msg = j.message;
        } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      // Try to grab the filename from Content-Disposition; fallback to a sensible default.
      const cd = res.headers.get('content-disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `${r.id}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDoneId(r.id);
      addToast({ kind: 'success', title: 'Download ready', body: filename });
      setTimeout(() => setDoneId(null), 2500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addToast({ kind: 'error', title: `Could not generate ${r.title}`, body: msg });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rpts">
      <div className="rpts-head">
        <h1>Reports</h1>
        <p className="muted">
          Branded, print-quality PDFs — perfect for records, audits and reimbursements. Pick a period, then download.
        </p>
      </div>

      <div className="rpts-period card">
        <div className="rpts-period-label">
          <CalendarClock size={16} />
          <span>Period</span>
        </div>
        <div className="rpts-period-controls">
          <label className="rpts-period-field">
            <span>Year</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="rpts-period-field">
            <span>Month</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="rpts-period-hint muted">
          Year applies to every report. Month is used by Attendance, Summary, and Company. Leave History always covers the full cycle year.
        </p>
      </div>

      <div className="rpts-grid">
        {list.map((r, i) => {
          const busy = busyId === r.id;
          const done = doneId === r.id;
          return (
            <motion.div
              key={r.id}
              className="rpts-card card"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="rpts-icon" style={{ background: r.bg, color: r.accent }}>
                {r.icon}
              </div>
              <div className="rpts-body">
                <h4>{r.title}</h4>
                <p>{r.body}</p>
                <div className="rpts-scope">
                  {r.usesMonth
                    ? `${MONTH_NAMES[month - 1]} ${year}`
                    : `Full cycle ${year}`}
                  {r.adminOnly ? ' · HR / Admin only' : ''}
                </div>
              </div>
              <Button
                variant={done ? 'success' : 'primary'}
                leadingIcon={
                  busy ? <Loader2 size={14} className="rpts-spin" /> :
                  done ? <Check size={14} /> :
                  <Download size={14} />
                }
                onClick={() => download(r)}
                disabled={busy}
              >
                {busy ? 'Generating…' : done ? 'Downloaded' : 'Download PDF'}
              </Button>
            </motion.div>
          );
        })}
      </div>

      <div className="rpts-note card">
        <strong>About these PDFs</strong>
        <p>
          Every report is rendered fresh on the server the moment you click Download — nothing is cached. The Trace logo, brand colors, and layout come straight from the app's design system. Sensitive data (personal reasons, adjustment notes) is included only where you already have permission to see it in the app.
        </p>
      </div>
    </div>
  );
}
