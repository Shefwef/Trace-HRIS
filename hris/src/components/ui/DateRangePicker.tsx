'use client';
import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import './DateRangePicker.css';

// ── Types ─────────────────────────────────────────────────

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'this-year'
  | 'last-year'
  | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
  preset: DatePreset;
}

interface Props {
  value: DateRange;
  onChange: (v: DateRange) => void;
  className?: string;
}

// ── Date helpers ──────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}
function endOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(23, 59, 59, 999); return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function computeRange(preset: DatePreset, cs?: Date, ce?: Date): { start: Date; end: Date } {
  const now = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case 'today':
      return { start: today, end: endOfDay(now) };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { start: y, end: endOfDay(y) };
    }
    case 'this-week': {
      const sun = addDays(today, -today.getDay());
      return { start: startOfDay(sun), end: endOfDay(now) };
    }
    case 'last-week': {
      const thisSun = addDays(today, -today.getDay());
      const prevSun = addDays(thisSun, -7);
      const prevSat = addDays(thisSun, -1);
      return { start: startOfDay(prevSun), end: endOfDay(prevSat) };
    }
    case 'this-month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case 'last-month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case 'last-3-months': {
      const s = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case 'last-6-months': {
      const s = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case 'this-year': {
      const s = new Date(now.getFullYear(), 0, 1);
      const e = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case 'last-year': {
      const y = now.getFullYear() - 1;
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) };
    }
    case 'custom':
      return { start: cs ?? today, end: ce ? endOfDay(ce) : endOfDay(now) };
  }
}

/** Human-readable label for the trigger button's secondary text. */
function formatRange(r: DateRange): string {
  const fmtDay = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const fmtMon = (d: Date) =>
    d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  switch (r.preset) {
    case 'today':     return r.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    case 'yesterday': return r.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    case 'this-week':
    case 'last-week':
      return `${fmtDay(r.start)} – ${fmtDay(r.end)} ${r.end.getFullYear()}`;
    case 'this-month':
    case 'last-month':
      return fmtMon(r.start);
    case 'last-3-months':
    case 'last-6-months':
      return `${fmtDay(r.start)} – ${fmtDay(r.end)} ${r.end.getFullYear()}`;
    case 'this-year':
    case 'last-year':
      return `${r.start.getFullYear()}`;
    case 'custom': {
      const sameYear = r.start.getFullYear() === r.end.getFullYear();
      return `${fmtDay(r.start)} – ${fmtDay(r.end)}${sameYear ? ` ${r.end.getFullYear()}` : ''}`;
    }
  }
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── Preset grid ──────────────────────────────────────────

const PRESET_GRID: { key: DatePreset; label: string }[][] = [
  [{ key: 'today',          label: 'Today' },          { key: 'yesterday',    label: 'Yesterday' }],
  [{ key: 'this-week',      label: 'This week' },      { key: 'last-week',    label: 'Last week' }],
  [{ key: 'this-month',     label: 'This month' },     { key: 'last-month',   label: 'Last month' }],
  [{ key: 'last-3-months',  label: 'Last 3 months' },  { key: 'last-6-months', label: 'Last 6 months' }],
  [{ key: 'this-year',      label: 'This year' },      { key: 'last-year',    label: 'Last year' }],
];

const PRESET_LABEL: Record<DatePreset, string> = {
  'today':          'Today',
  'yesterday':      'Yesterday',
  'this-week':      'This week',
  'last-week':      'Last week',
  'this-month':     'This month',
  'last-month':     'Last month',
  'last-3-months':  'Last 3 months',
  'last-6-months':  'Last 6 months',
  'this-year':      'This year',
  'last-year':      'Last year',
  'custom':         'User defined',
};

// ── Factory ───────────────────────────────────────────────

/** Create a DateRange from a preset. Useful for initialising state. */
export function makeDateRange(preset: DatePreset = 'this-month'): DateRange {
  const { start, end } = computeRange(preset);
  return { start, end, preset };
}

// ── Component ─────────────────────────────────────────────

export function DateRangePicker({ value, onChange, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(toIso(value.start));
  const [customEnd, setCustomEnd] = useState(toIso(value.end));
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep custom inputs in sync when value changes from outside
  useEffect(() => {
    if (value.preset !== 'custom') {
      setCustomStart(toIso(value.start));
      setCustomEnd(toIso(value.end));
    }
  }, [value]);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function selectPreset(preset: DatePreset) {
    if (preset === 'custom') return; // handled by Apply button
    const { start, end } = computeRange(preset);
    onChange({ start, end, preset });
    setOpen(false);
  }

  function applyCustom() {
    if (!customStart || !customEnd) return;
    const s = new Date(customStart + 'T00:00:00');
    const e = new Date(customEnd + 'T23:59:59');
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return;
    onChange({ start: s, end: e, preset: 'custom' });
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={`drp ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        className={`drp-trigger${open ? ' drp-trigger--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Calendar size={14} className="drp-trigger-cal" />
        <span className="drp-trigger-preset">{PRESET_LABEL[value.preset]}</span>
        <span className="drp-trigger-sep" aria-hidden>·</span>
        <span className="drp-trigger-range">{formatRange(value)}</span>
        <ChevronDown size={13} className={`drp-trigger-chevron${open ? ' drp-trigger-chevron--up' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="drp-panel" role="listbox">
          {/* Preset grid */}
          <div className="drp-presets">
            {PRESET_GRID.map((row, ri) => (
              <div key={ri} className="drp-preset-row">
                {row.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="option"
                    aria-selected={value.preset === p.key}
                    className={`drp-preset${value.preset === p.key ? ' drp-preset--active' : ''}`}
                    onClick={() => selectPreset(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="drp-divider" role="separator" />

          {/* User-defined range */}
          <div className="drp-custom">
            <p className="drp-custom-heading">User defined</p>
            <div className="drp-custom-row">
              <div className="drp-custom-field">
                <label htmlFor="drp-cs">From</label>
                <input
                  id="drp-cs"
                  type="date"
                  className="drp-date-input"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="drp-custom-field">
                <label htmlFor="drp-ce">To</label>
                <input
                  id="drp-ce"
                  type="date"
                  className="drp-date-input"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              className="drp-apply"
              disabled={!customStart || !customEnd || customStart > customEnd}
              onClick={applyCustom}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
