'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarCheck, Clock, TrendingUp, Info, Plus, X } from 'lucide-react';
import { useBalance, useMyExtraWork, type ExtraWorkSummary } from '@/lib/hooks';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { LogExtraWorkModal } from '../../components/attendance/LogExtraWorkModal';
import { cx, fmtDate } from '../../lib/utils';
import './ReplacementLeave.css';

/**
 * Employee's Replacement Leave page. Shows:
 *   • Balance headline cards (current / pending / earned this month)
 *   • Recent credit banner when the most recent approval is fresh
 *   • Full history of submitted extra-work logs with status
 *   • Balance calculation side panel — previous balance + credits from
 *     this month's approvals
 *
 * All data comes from existing endpoints (useBalance + useMyExtraWork);
 * no new backend is required for this page.
 */
export function ReplacementLeavePage() {
  const { data: balance } = useBalance();
  const { data: extraWork = [], isLoading } = useMyExtraWork();
  const [logOpen, setLogOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const current = Number(balance?.replacementBalance ?? 0);

  const pendingLogs = useMemo(() => extraWork.filter((x) => x.status === 'PENDING'), [extraWork]);
  const pendingDaysCredit = pendingLogs.reduce((s, x) => s + creditOf(x.workType), 0);

  const now = new Date();
  const monthApprovedLogs = extraWork.filter(
    (x) => x.status === 'APPROVED' && sameMonth(new Date(x.reviewedAt ?? x.workDate), now),
  );
  const earnedThisMonth = monthApprovedLogs.reduce((s, x) => s + creditOf(x.workType), 0);

  // The freshest approved log (any month), only shown as a banner if it was
  // decided in the last 7 days. Auto-hides once the user dismisses it.
  const latestApproved = extraWork
    .filter((x) => x.status === 'APPROVED' && x.reviewedAt)
    .sort((a, b) => (a.reviewedAt! < b.reviewedAt! ? 1 : -1))[0];
  const freshApproval =
    latestApproved && Date.now() - new Date(latestApproved.reviewedAt!).getTime() < 7 * 86_400_000
      ? latestApproved
      : null;

  const previousBalance = Math.max(0, current - earnedThisMonth);

  return (
    <div className="rlp">
      <div className="rlp-topbar">
        <Link href="/leaves" className="rlp-back">
          <ArrowLeft size={16} /> Back to My Leaves
        </Link>
      </div>

      <header className="rlp-head">
        <div>
          <h1>Replacement Leave</h1>
          <p className="muted">Days you&apos;ve earned by working weekends or public holidays.</p>
        </div>
        <Button variant="primary" leadingIcon={<Plus size={16} />} onClick={() => setLogOpen(true)}>
          Log extra work day
        </Button>
      </header>

      {/* Headline cards */}
      <div className="rlp-stats">
        <StatCard
          icon={<CalendarCheck size={16} />}
          label="Current balance"
          value={<>{formatDays(current)} <span className="rlp-stat-unit">day{current === 1 ? '' : 's'}</span></>}
          tone="brand"
        />
        <StatCard
          icon={<Clock size={16} />}
          label="Pending approval"
          value={<>{formatDays(pendingDaysCredit)} <span className="rlp-stat-unit">day{pendingDaysCredit === 1 ? '' : 's'}</span></>}
          tone="warning"
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="Earned this month"
          value={<>+{formatDays(earnedThisMonth)} <span className="rlp-stat-unit">day{earnedThisMonth === 1 ? '' : 's'}</span></>}
          tone="success"
        />
      </div>

      {freshApproval && !bannerDismissed && (
        <div className="rlp-banner">
          <div className="rlp-banner-icon"><CalendarCheck size={16} /></div>
          <div className="rlp-banner-body">
            <strong>Replacement leave credited</strong>
            <p>
              {formatDays(creditOf(freshApproval.workType))} day{creditOf(freshApproval.workType) === 1 ? '' : 's'} added to your balance for {fmtDate(freshApproval.workDate, 'd MMM yyyy')} — approved by {freshApproval.reviewer?.fullName ?? 'HR'}.
            </p>
          </div>
          <button className="rlp-banner-close" onClick={() => setBannerDismissed(true)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Two-column: history table + calculation panel */}
      <div className="rlp-grid">
        <section className="card rlp-history">
          <header className="rlp-history-head">
            <h2>Replacement leave history</h2>
          </header>
          {isLoading ? (
            <div className="rlp-loading">Loading…</div>
          ) : extraWork.length === 0 ? (
            <EmptyState
              title="No extra work logged yet"
              body="Worked on a weekend or holiday? Log it and HR will convert it into replacement leave."
            />
          ) : (
            <div className="rlp-table-wrap">
              <table className="rlp-table">
                <thead>
                  <tr>
                    <th>Work date</th>
                    <th>Day</th>
                    <th>Slot</th>
                    <th className="rlp-num">Leave credited</th>
                    <th>Status</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {extraWork.map((x) => (
                    <tr key={x.id}>
                      <td className="mono">{fmtDate(x.workDate, 'd MMM yyyy')}</td>
                      <td>{fmtDate(x.workDate, 'EEEE')}</td>
                      <td>{slotLabelOf(x.workType)}</td>
                      <td className="rlp-num mono">
                        {x.status === 'APPROVED' ? (
                          <strong>+{formatDays(creditOf(x.workType))}</strong>
                        ) : x.status === 'PENDING' ? (
                          <span className="muted">— pending —</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <Badge variant={statusVariantOf(x.status)}>{x.status.toLowerCase()}</Badge>
                      </td>
                      <td className="rlp-reason" title={x.reason}>{x.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="card rlp-calc">
          <h2>Balance calculation</h2>
          <div className="rlp-calc-row">
            <span>Previous balance</span>
            <strong>{formatDays(previousBalance)} day{previousBalance === 1 ? '' : 's'}</strong>
          </div>
          <div className="rlp-calc-row rlp-calc-row-plus">
            <span>+ Approved this month</span>
            <strong>{formatDays(earnedThisMonth)} day{earnedThisMonth === 1 ? '' : 's'}</strong>
          </div>
          <div className="rlp-calc-total">
            <span>Current balance</span>
            <strong>{formatDays(current)} <span className="rlp-calc-unit">day{current === 1 ? '' : 's'}</span></strong>
          </div>
          <div className="rlp-info-note">
            <Info size={12} />
            <span>HR reviews each entry and decides Full or Half day eligibility based on the hours you worked.</span>
          </div>
        </aside>
      </div>

      <LogExtraWorkModal open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: 'brand' | 'warning' | 'success';
}) {
  return (
    <div className={cx('rlp-stat', `rlp-stat-${tone}`)}>
      <div className="rlp-stat-icon">{icon}</div>
      <div>
        <div className="rlp-stat-label">{label}</div>
        <div className="rlp-stat-value">{value}</div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────

function creditOf(workType: ExtraWorkSummary['workType']): number {
  return workType === 'FULL_DAY' ? 1 : 0.5;
}

function slotLabelOf(workType: ExtraWorkSummary['workType']): string {
  return workType === 'FULL_DAY' ? 'Full day' : workType === 'HALF_DAY_MORNING' ? 'Half — morning' : 'Half — afternoon';
}

function statusVariantOf(s: ExtraWorkSummary['status']): 'warning' | 'success' | 'danger' {
  return s === 'PENDING' ? 'warning' : s === 'APPROVED' ? 'success' : 'danger';
}

function formatDays(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
