'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileSpreadsheet, FileText, TrendingUp, Users, CalendarClock, Navigation,
  Loader2, Check, Download,
} from 'lucide-react';
import { useCurrentUser } from '@/lib/session';
import { useStore } from '@/lib/store';
import { Button } from '../../components/ui/Button';
import './Reports.css';

type ReportType = 'attendance' | 'leaves' | 'summary' | 'all-employees' | 'offsite';
type Format = 'xlsx' | 'pdf';

interface ReportDef {
  id: ReportType;
  title: string;
  body: string;
  icon: React.ReactNode;
  accent: string;
  bg: string;
  usesMonth: boolean;
  adminOnly?: boolean;
  /**
   * False for reports that only make sense as a spreadsheet. The off-site
   * report is fourteen columns wide including coordinates — a PDF of it would
   * be unreadable, so the button is simply absent rather than producing one.
   */
  hasPdf?: boolean;
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
    hasPdf: true,
  },
  {
    id: 'attendance',
    title: 'Monthly attendance',
    body: 'Every clock-in, clock-out, break and overtime for the month, plus where each day was worked from. Three sheets: summary, daily rows, off-site periods.',
    icon: <CalendarClock size={20} />,
    accent: 'var(--color-brand-primary)',
    bg: 'var(--color-info-light)',
    usesMonth: true,
    hasPdf: true,
  },
  {
    id: 'leaves',
    title: 'Leave history',
    body: 'Every leave request in the selected cycle — dates, reason, reviewer and decision — with the balance it was drawn against.',
    icon: <FileText size={20} />,
    accent: 'var(--color-leave-casual)',
    bg: 'var(--color-leave-casual-light)',
    usesMonth: false,
    hasPdf: true,
  },
  {
    id: 'offsite',
    title: 'Off-site work',
    body: 'Every location period in the month — place, address, coordinates, purpose, duration, and who recorded it. Covers whoever you can see on the location board.',
    icon: <Navigation size={20} />,
    accent: 'var(--color-warning)',
    bg: 'var(--color-warning-light)',
    usesMonth: true,
  },
  {
    id: 'all-employees',
    title: 'Company cycle report',
    body: 'HR / Admin only. Five sheets — headline figures, per-employee summary, every daily attendance row, off-site periods and leave requests.',
    icon: <Users size={20} />,
    accent: 'var(--color-danger)',
    bg: 'var(--color-danger-light)',
    usesMonth: true,
    adminOnly: true,
    hasPdf: true,
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
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!user) return null;

  // Multi-role holders are the norm here — the COO carries ADMIN + HR + EMPLOYEE,
  // and reading only the denormalised primary role would hide this card from
  // half the people entitled to it. The server re-checks via the permission
  // matrix, so this is presentation only.
  const roles = user.roles.length > 0 ? user.roles : [user.role];
  const isAdmin =
    roles.includes('HR') || roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  const isManager = isAdmin || roles.includes('LINE_MANAGER');

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const list = REPORTS.filter((r) => !r.adminOnly || isAdmin);

  async function download(r: ReportDef, format: Format) {
    const key = `${r.id}:${format}`;
    setBusy(key);
    setDone(null);
    try {
      const q = new URLSearchParams({ year: String(year), format });
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
      // Prefer the server's filename — it carries the resolved date range.
      const cd = res.headers.get('content-disposition') ?? '';
      const filename = cd.match(/filename="([^"]+)"/)?.[1] ?? `${r.id}.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDone(key);
      addToast({ kind: 'success', title: 'Download ready', body: filename });
      setTimeout(() => setDone(null), 2500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addToast({ kind: 'error', title: `Could not generate ${r.title}`, body: msg });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rpts">
      <div className="rpts-head">
        <h1>Reports</h1>
        <p className="muted">
          Formatted Excel workbooks — filter, pivot and paste straight into payroll or audit
          sheets. Pick a period, then export. A print-ready PDF is available where it makes sense.
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
          Every export contains exactly the period selected here — nothing wider, nothing
          cached. Leave History always covers the full cycle year.
        </p>
      </div>

      <div className="rpts-grid">
        {list.map((r, i) => (
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
                {r.usesMonth ? `${MONTH_NAMES[month - 1]} ${year}` : `Full cycle ${year}`}
                {r.adminOnly ? ' · HR / Admin only' : ''}
                {r.id === 'offsite'
                  ? isAdmin
                    ? ' · everyone'
                    : isManager
                      ? ' · your team'
                      : ' · your own records'
                  : ''}
              </div>
            </div>

            <div className="rpts-actions">
              <Button
                variant={done === `${r.id}:xlsx` ? 'success' : 'primary'}
                leadingIcon={
                  busy === `${r.id}:xlsx` ? <Loader2 size={14} className="rpts-spin" /> :
                  done === `${r.id}:xlsx` ? <Check size={14} /> :
                  <FileSpreadsheet size={14} />
                }
                onClick={() => download(r, 'xlsx')}
                disabled={busy !== null}
              >
                {busy === `${r.id}:xlsx` ? 'Building…'
                  : done === `${r.id}:xlsx` ? 'Downloaded'
                  : 'Export Excel'}
              </Button>

              {r.hasPdf && (
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={
                    busy === `${r.id}:pdf` ? <Loader2 size={13} className="rpts-spin" /> :
                    done === `${r.id}:pdf` ? <Check size={13} /> :
                    <Download size={13} />
                  }
                  onClick={() => download(r, 'pdf')}
                  disabled={busy !== null}
                >
                  {busy === `${r.id}:pdf` ? 'Rendering…'
                    : done === `${r.id}:pdf` ? 'Downloaded'
                    : 'PDF'}
                </Button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="rpts-note card">
        <strong>About these exports</strong>
        <p>
          Workbooks open on a Summary sheet carrying the period and headline figures, then the
          raw rows. Header rows are frozen and filterable; hours, days and rates are real
          numbers rather than text, so they sort and total correctly, and each sheet ends with
          a live <span className="mono">SUM()</span> row. Times are shown in Dhaka time.
          Everything is generated fresh on request, and you only ever receive rows you already
          have permission to see in the app.
        </p>
      </div>
    </div>
  );
}
