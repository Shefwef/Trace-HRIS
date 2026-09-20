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
import { type DatePreset, makeDateRange, type DateRange } from '../../components/ui/DateRangePicker';
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

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today',         label: 'Today' },
  { key: 'yesterday',     label: 'Yesterday' },
  { key: 'this-week',     label: 'This week' },
  { key: 'last-week',     label: 'Last week' },
  { key: 'this-month',    label: 'This month' },
  { key: 'last-month',    label: 'Last month' },
  { key: 'last-3-months', label: 'Last 3 months' },
  { key: 'last-6-months', label: 'Last 6 months' },
  { key: 'this-year',     label: 'This year' },
  { key: 'last-year',     label: 'Last year' },
  { key: 'custom',        label: 'Custom' },
];

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function ReportsPage() {
  const user = useCurrentUser();
  const addToast = useStore((s) => s.addToast);

  const [dateRange, setDateRange] = useState<DateRange>(() => makeDateRange('this-month'));
  const [customStart, setCustomStart] = useState(() => toIso(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toIso(new Date()));
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!user) return null;

  const roles = user.roles.length > 0 ? user.roles : [user.role];
  const isAdmin =
    roles.includes('HR') || roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  const isManager = isAdmin || roles.includes('LINE_MANAGER');

  const list = REPORTS.filter((r) => !r.adminOnly || isAdmin);

  const year = dateRange.start.getFullYear();
  const month = dateRange.start.getMonth() + 1;

  function scopeLabel(r: ReportDef): string {
    if (!r.usesMonth) return `Full cycle ${year}`;
    const isMultiMonth = ['last-3-months', 'last-6-months'].includes(dateRange.preset);
    if (isMultiMonth) {
      const startMon = MONTH_NAMES[dateRange.start.getMonth()];
      const endMon   = MONTH_NAMES[dateRange.end.getMonth()];
      const endYear  = dateRange.end.getFullYear();
      return `${startMon} – ${endMon} ${endYear} (start month exported)`;
    }
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  function selectPreset(key: DatePreset) {
    if (key === 'custom') {
      setCustomStart(toIso(dateRange.start));
      setCustomEnd(toIso(dateRange.end));
      setDateRange((dr) => ({ ...dr, preset: 'custom' }));
    } else {
      setDateRange(makeDateRange(key));
    }
  }

  function applyCustom() {
    if (!customStart || !customEnd || customStart > customEnd) return;
    const s = new Date(customStart + 'T00:00:00');
    const e = new Date(customEnd + 'T23:59:59');
    setDateRange({ start: s, end: e, preset: 'custom' });
  }

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

      {/* Period picker — select dropdown + inline custom date inputs */}
      <div className="rpts-period card">
        <div className="rpts-period-label">
          <CalendarClock size={15} />
          <span>Period</span>
        </div>
        <div className="rpts-period-controls">
          <select
            className="rpts-period-select"
            value={dateRange.preset}
            onChange={(e) => selectPreset(e.target.value as DatePreset)}
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>

          {/* Date inputs always rendered; only active when Custom is selected */}
          <span className="rpts-period-custom-label">From</span>
          <input
            type="date"
            className={`rpts-period-date-input${dateRange.preset !== 'custom' ? ' rpts-period-date-input--disabled' : ''}`}
            value={customStart}
            max={customEnd || undefined}
            disabled={dateRange.preset !== 'custom'}
            onChange={(e) => setCustomStart(e.target.value)}
          />
          <span className="rpts-period-custom-sep">—</span>
          <span className="rpts-period-custom-label">To</span>
          <input
            type="date"
            className={`rpts-period-date-input${dateRange.preset !== 'custom' ? ' rpts-period-date-input--disabled' : ''}`}
            value={customEnd}
            min={customStart || undefined}
            disabled={dateRange.preset !== 'custom'}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={dateRange.preset !== 'custom' || !customStart || !customEnd || customStart > customEnd}
            onClick={applyCustom}
          >
            Apply
          </Button>
        </div>
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
                {scopeLabel(r)}
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
          have permission to see in the app. For multi-month presets (Last 3 months, Last 6
          months), the report uses the <strong>start month</strong> of the selected range.
        </p>
      </div>
    </div>
  );
}
