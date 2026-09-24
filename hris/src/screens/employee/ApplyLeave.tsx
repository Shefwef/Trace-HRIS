'use client';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, X, Send, Loader2, FileText, Upload } from 'lucide-react';
import {
  useBalance,
  useSubmitLeaveBundle,
  useHolidays,
  type LeaveType,
  type LeaveDayAllocation,
  type LeaveSlot,
} from '@/lib/hooks';
import { useStore } from '@/lib/store';
import { Button } from '../../components/ui/Button';
import { Field, TextInput, TextArea } from '../../components/ui/Field';
import { cx, fmtDate } from '../../lib/utils';
import './ApplyLeave.css';

// ─── Types ─────────────────────────────────────────────────

interface TypeState {
  enabled: boolean;
  startDate: string;
  endDate: string;
  /** Keyed by ISO date → slot chosen. Missing keys use FULL. */
  overrides: Record<string, LeaveSlot>;
}

const emptyState: TypeState = { enabled: false, startDate: '', endDate: '', overrides: {} };

const TYPE_META: Record<LeaveType, { label: string; short: string; className: string; balanceKey: keyof AvailableBalance }> = {
  CASUAL:      { label: 'Casual leave',      short: 'CL', className: 'aply-type-casual',      balanceKey: 'casual' },
  SICK:        { label: 'Sick leave',        short: 'SL', className: 'aply-type-sick',        balanceKey: 'sick' },
  REPLACEMENT: { label: 'Replacement leave', short: 'RL', className: 'aply-type-replacement', balanceKey: 'replacement' },
};

interface AvailableBalance { casual: number; sick: number; replacement: number }

// ─── Helpers ───────────────────────────────────────────────

/**
 * Enumerate ISO dates between two YYYY-MM-DD strings, excluding office non-
 * working days. Bangladesh weekend is Friday + Saturday, and any date in
 * `holidays` is also skipped so leave can't be requested on a paid-off day.
 */
function daysBetween(start: string, end: string, holidays: Set<string>): string[] {
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  for (let d = s; d <= e; d = new Date(d.getTime() + 86_400_000)) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay(); // 0 = Sun … 5 = Fri, 6 = Sat
    if (dow === 5 || dow === 6) continue;         // BD weekend
    if (holidays.has(iso)) continue;               // public holiday
    out.push(iso);
  }
  return out;
}

function slotValue(slot: LeaveSlot): number {
  return slot === 'FULL' ? 1 : 0.5;
}

function buildAllocation(state: TypeState, holidays: Set<string>): LeaveDayAllocation[] {
  return daysBetween(state.startDate, state.endDate, holidays).map((date) => ({
    date,
    slot: state.overrides[date] ?? 'FULL',
  }));
}

function durationOf(alloc: LeaveDayAllocation[]): number {
  return alloc.reduce((sum, e) => sum + slotValue(e.slot), 0);
}

// ─── Page ──────────────────────────────────────────────────

export function ApplyLeavePage() {
  const router = useRouter();
  const { data: balance, isLoading: balanceLoading } = useBalance();
  const { data: holidayList = [] } = useHolidays();
  const submit = useSubmitLeaveBundle();
  const addToast = useStore((s) => s.addToast);

  // Fast lookup for weekend + public-holiday exclusion.
  const holidays = useMemo(() => new Set(holidayList.map((h) => h.date)), [holidayList]);

  const [casual, setCasual]           = useState<TypeState>({ ...emptyState });
  const [sick, setSick]               = useState<TypeState>({ ...emptyState });
  const [replacement, setReplacement] = useState<TypeState>({ ...emptyState });

  const [reason, setReason]           = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment]   = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const available: AvailableBalance = balance
    ? {
        casual: balance.casualTotal - balance.casualUsed - balance.casualPending,
        sick: balance.sickTotal - balance.sickUsed - balance.sickPending,
        replacement: balance.replacementBalance,
      }
    : { casual: 0, sick: 0, replacement: 0 };

  const casualAlloc = useMemo(() => casual.enabled ? buildAllocation(casual, holidays) : [], [casual, holidays]);
  const sickAlloc   = useMemo(() => sick.enabled ? buildAllocation(sick, holidays) : [], [sick, holidays]);
  const replAlloc   = useMemo(() => replacement.enabled ? buildAllocation(replacement, holidays) : [], [replacement, holidays]);

  const casualDuration = durationOf(casualAlloc);
  const sickDuration   = durationOf(sickAlloc);
  const replDuration   = durationOf(replAlloc);

  // Collision detection: no single day should be selected in more than one type.
  const dayCollision = useMemo(() => {
    const seen = new Map<string, LeaveType>();
    for (const [type, alloc] of [
      ['CASUAL',      casualAlloc],
      ['SICK',        sickAlloc],
      ['REPLACEMENT', replAlloc],
    ] as [LeaveType, LeaveDayAllocation[]][]) {
      for (const entry of alloc) {
        const prior = seen.get(entry.date);
        if (prior && prior !== type) return { date: entry.date, first: prior, second: type };
        seen.set(entry.date, type);
      }
    }
    return null;
  }, [casualAlloc, sickAlloc, replAlloc]);

  const anyEnabled  = casual.enabled || sick.enabled || replacement.enabled;
  const totalDays   = casualDuration + sickDuration + replDuration;

  // Balance validation — user cannot request more than they have.
  const overBudget = (
    (casual.enabled && casualDuration > available.casual) ||
    (sick.enabled && sickDuration > available.sick) ||
    (replacement.enabled && replDuration > available.replacement)
  );

  const canSubmit =
    anyEnabled &&
    totalDays > 0 &&
    !overBudget &&
    !dayCollision &&
    reason.trim().length >= 2 &&
    !submit.isPending;

  async function onFilePicked(file: File | null) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload/leave-attachment', { method: 'POST', body });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? `Upload failed (${res.status})`);
      }
      const j = (await res.json()) as { url: string; name: string };
      setAttachment({ url: j.url, name: j.name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      // Clear the input so re-selecting the same file re-triggers change.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    const items: { leaveType: LeaveType; perDayAllocation: LeaveDayAllocation[] }[] = [];
    if (casual.enabled      && casualAlloc.length) items.push({ leaveType: 'CASUAL',      perDayAllocation: casualAlloc });
    if (sick.enabled        && sickAlloc.length)   items.push({ leaveType: 'SICK',        perDayAllocation: sickAlloc });
    if (replacement.enabled && replAlloc.length)   items.push({ leaveType: 'REPLACEMENT', perDayAllocation: replAlloc });

    submit.mutate(
      {
        items,
        reason: reason.trim(),
        description: description.trim() || undefined,
        attachmentUrl: attachment?.url,
        // In-app notification is always sent; email is always cc'd to
        // reviewers so nothing sits waiting in a channel HR isn't watching.
        channels: ['IN_APP', 'EMAIL'],
      },
      {
        onSuccess: () => {
          addToast({ kind: 'success', title: 'Leave request submitted', body: `${items.length} type${items.length === 1 ? '' : 's'} pending review.` });
          router.push('/leaves');
        },
        onError: (e: Error) => setError(e.message),
      },
    );
  }

  return (
    <div className="aply">
      <div className="aply-head">
        <Link href="/leaves" className="aply-back">
          <ArrowLeft size={16} /> Back to My Leaves
        </Link>
        <h1>Apply for leave</h1>
        <p className="muted">Pick one or more leave types. Every day you select goes into the same submission and is reviewed together.</p>
      </div>

      <div className="aply-grid">
        <div className="aply-main">
          <TypeCard
            type="CASUAL"
            state={casual}
            setState={setCasual}
            balance={available.casual}
            durationSelected={casualDuration}
            balanceLoading={balanceLoading}
            holidays={holidays}
          />
          <TypeCard
            type="SICK"
            state={sick}
            setState={setSick}
            balance={available.sick}
            durationSelected={sickDuration}
            balanceLoading={balanceLoading}
            holidays={holidays}
          />
          <TypeCard
            type="REPLACEMENT"
            state={replacement}
            setState={setReplacement}
            balance={available.replacement}
            durationSelected={replDuration}
            balanceLoading={balanceLoading}
            holidays={holidays}
          />

          <section className="card aply-details">
            <h3>Details</h3>
            <Field label="Reason" required hint="Short summary — this shows up in the review inbox.">
              <TextInput
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Family event, medical appointment"
                maxLength={100}
              />
            </Field>
            <Field label="Description" hint="Optional — any extra context for your manager.">
              <TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Longer note if the reason line isn't enough."
                maxLength={500}
              />
            </Field>
            <Field label="Attachment" hint="Optional — PDF, DOC, image (max 5 MB).">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }}
                onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
              />
              {!attachment ? (
                <button
                  type="button"
                  className="aply-drop"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 size={18} className="aply-spin" />
                      <span>Uploading…</span>
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      <span>
                        <strong>Click to upload</strong> a medical certificate or supporting doc
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aply-file-chip"
                >
                  <FileText size={16} className="aply-file-chip-icon" />
                  <span className="aply-file-chip-name">{attachment.name}</span>
                  <button
                    type="button"
                    className="aply-file-chip-remove"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAttachment(null);
                    }}
                    aria-label="Remove attachment"
                  >
                    <X size={14} />
                  </button>
                </a>
              )}
            </Field>
          </section>
        </div>

        <aside className="aply-summary card">
          <h3>Request summary</h3>
          {!anyEnabled && <p className="muted aply-empty">Enable a leave type on the left to start.</p>}

          {casual.enabled && (
            <SummaryRow type="CASUAL" alloc={casualAlloc} balance={available.casual} />
          )}
          {sick.enabled && (
            <SummaryRow type="SICK" alloc={sickAlloc} balance={available.sick} />
          )}
          {replacement.enabled && (
            <SummaryRow type="REPLACEMENT" alloc={replAlloc} balance={available.replacement} />
          )}

          {anyEnabled && (
            <div className="aply-summary-total">
              <span>Total days off</span>
              <strong>{totalDays.toFixed(1).replace(/\.0$/, '')}</strong>
            </div>
          )}

          {dayCollision && (
            <div className="aply-warn">
              {fmtDate(dayCollision.date, 'd MMM')} is picked in both {TYPE_META[dayCollision.first].label.toLowerCase()} and {TYPE_META[dayCollision.second].label.toLowerCase()}. Pick one.
            </div>
          )}
          {overBudget && (
            <div className="aply-warn">
              One of the types exceeds your available balance. Reduce the range or switch to half-days.
            </div>
          )}
          {error && (
            <div className="aply-warn">{error}</div>
          )}

          <div className="aply-actions">
            <Button variant="ghost" onClick={() => router.push('/leaves')}>Cancel</Button>
            <Button
              variant="primary"
              leadingIcon={submit.isPending ? <Loader2 size={16} className="aply-spin" /> : <Send size={16} />}
              disabled={!canSubmit}
              onClick={onSubmit}
            >
              {submit.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Type card (Casual / Sick / Replacement) ───────────────

function TypeCard({
  type, state, setState, balance, durationSelected, balanceLoading, holidays,
}: {
  type: LeaveType;
  state: TypeState;
  setState: (s: TypeState) => void;
  balance: number;
  durationSelected: number;
  balanceLoading: boolean;
  holidays: Set<string>;
}) {
  const meta = TYPE_META[type];
  const remaining = Math.max(0, balance - durationSelected);
  const over = durationSelected > balance;
  const days = state.enabled ? daysBetween(state.startDate, state.endDate, holidays) : [];
  const today = new Date().toISOString().slice(0, 10);
  // If the picked range has any excluded days, show a small hint underneath
  // the date row so the user sees why some days aren't in the list.
  const rawRangeLen = state.startDate && state.endDate && state.startDate <= state.endDate
    ? Math.round((new Date(state.endDate).getTime() - new Date(state.startDate).getTime()) / 86_400_000) + 1
    : 0;
  const skippedCount = state.enabled ? Math.max(0, rawRangeLen - days.length) : 0;

  function toggleEnabled(next: boolean) {
    if (next) setState({ ...state, enabled: true });
    else setState({ ...emptyState });
  }

  function updateOverride(date: string, slot: LeaveSlot) {
    setState({ ...state, overrides: { ...state.overrides, [date]: slot } });
  }

  return (
    <section className={cx('card aply-type', meta.className, state.enabled && 'aply-type-active')}>
      <label className="aply-type-head">
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => toggleEnabled(e.target.checked)}
        />
        <div>
          <div className="aply-type-title">{meta.label}</div>
          <div className="aply-type-sub">
            {balanceLoading
              ? 'Loading balance…'
              : (
                <>
                  {balance.toFixed(1).replace(/\.0$/, '')} day{balance === 1 ? '' : 's'} available
                  {state.enabled && durationSelected > 0 && (
                    <>
                      {' · '}
                      <span className={cx('aply-remaining', over && 'aply-remaining-over')}>
                        {remaining.toFixed(1).replace(/\.0$/, '')} left after this
                      </span>
                    </>
                  )}
                </>
              )}
          </div>
        </div>
      </label>

      {state.enabled && (
        <>
          <div className="aply-daterow">
            <label className="aply-label aply-label-inline">
              <span>From</span>
              <input
                type="date"
                className="input"
                value={state.startDate}
                min={today}
                onChange={(e) => setState({ ...state, startDate: e.target.value, overrides: {} })}
              />
            </label>
            <label className="aply-label aply-label-inline">
              <span>To</span>
              <input
                type="date"
                className="input"
                value={state.endDate}
                min={state.startDate || today}
                onChange={(e) => setState({ ...state, endDate: e.target.value, overrides: {} })}
              />
            </label>
          </div>

          {skippedCount > 0 && (
            <div className="aply-skip-hint">
              {skippedCount} day{skippedCount === 1 ? '' : 's'} in the range {skippedCount === 1 ? 'is' : 'are'} a weekend or public holiday — excluded automatically.
            </div>
          )}

          {days.length > 0 && (
            <div className="aply-days">
              {days.map((d) => (
                <DayRow
                  key={d}
                  date={d}
                  slot={state.overrides[d] ?? 'FULL'}
                  onChange={(slot) => updateOverride(d, slot)}
                />
              ))}
            </div>
          )}
          {state.startDate && state.endDate && state.startDate <= state.endDate && days.length === 0 && (
            <div className="aply-skip-hint">
              Every day in this range is a weekend or public holiday — pick a different range.
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── One day row inside a type card ────────────────────────

function DayRow({ date, slot, onChange }: {
  date: string;
  slot: LeaveSlot;
  onChange: (slot: LeaveSlot) => void;
}) {
  const isHalf = slot !== 'FULL';
  return (
    <div className={cx('aply-day', isHalf && 'aply-day-expanded')}>
      <div className="aply-day-main">
        <div className="aply-day-label">
          <strong>{fmtDate(date, 'EEE, d MMM')}</strong>
        </div>
        <div className="aply-day-controls">
          <label className={cx('aply-chip', slot === 'FULL' && 'aply-chip-on')}>
            <input
              type="radio"
              name={`day-${date}`}
              checked={slot === 'FULL'}
              onChange={() => onChange('FULL')}
            />
            Full day
          </label>
          <label className={cx('aply-chip', isHalf && 'aply-chip-on')}>
            <input
              type="checkbox"
              checked={isHalf}
              onChange={(e) => onChange(e.target.checked ? 'HALF_MORNING' : 'FULL')}
            />
            Half day
          </label>
        </div>
      </div>
      {isHalf && (
        <div className="aply-half-panel">
          <label className={cx('aply-half-option', slot === 'HALF_MORNING' && 'aply-half-option-on')}>
            <input
              type="radio"
              name={`half-${date}`}
              checked={slot === 'HALF_MORNING'}
              onChange={() => onChange('HALF_MORNING')}
            />
            <div>
              <strong>Morning</strong>
              <span>8:30 am – 1:00 pm</span>
            </div>
          </label>
          <label className={cx('aply-half-option', slot === 'HALF_AFTERNOON' && 'aply-half-option-on')}>
            <input
              type="radio"
              name={`half-${date}`}
              checked={slot === 'HALF_AFTERNOON'}
              onChange={() => onChange('HALF_AFTERNOON')}
            />
            <div>
              <strong>Afternoon</strong>
              <span>2:00 pm – 5:30 pm</span>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}

// ─── Summary row (right panel) ─────────────────────────────

function SummaryRow({ type, alloc, balance }: {
  type: LeaveType;
  alloc: LeaveDayAllocation[];
  balance: number;
}) {
  const meta = TYPE_META[type];
  const duration = durationOf(alloc);
  const remaining = balance - duration;
  const over = remaining < 0;

  return (
    <div className={cx('aply-summary-row', meta.className)}>
      <div className="aply-summary-row-head">
        <span className="aply-summary-badge">{meta.short}</span>
        <span className="aply-summary-name">{meta.label}</span>
        <span className={cx('aply-summary-days', over && 'aply-summary-days-over')}>
          {duration.toFixed(1).replace(/\.0$/, '')} day{duration === 1 ? '' : 's'}
        </span>
      </div>
      <div className="aply-summary-row-meta">
        {alloc.length === 0
          ? <span className="muted">No dates picked yet.</span>
          : <span>
              {fmtDate(alloc[0].date, 'd MMM')}
              {alloc.length > 1 && ` → ${fmtDate(alloc[alloc.length - 1].date, 'd MMM')}`}
              {' · '}
              <span className={cx('aply-remaining', over && 'aply-remaining-over')}>
                {remaining.toFixed(1).replace(/\.0$/, '')} remaining
              </span>
            </span>
        }
      </div>
    </div>
  );
}
