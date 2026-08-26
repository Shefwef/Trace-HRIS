'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin,
  Building2,
  Navigation,
  UserX,
  Users,
  AlertTriangle,
  Search,
  Wrench,
} from 'lucide-react';
import {
  useLocationBoard,
  useWorkLocation,
  useCorrectLocation,
  type LocationBoardRow,
  type WorkLocationEventItem,
} from '@/lib/hooks';
import { useStore } from '@/lib/store';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Field, TextInput, TextArea } from '../../components/ui/Field';
import { StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { avatarColorFor, initials } from '@/lib/session';
import { cx, fmtDate, fmtDuration, fmtTime, todayISO } from '../../lib/utils';
import './WorkLocations.css';

const EVENT_LABEL: Record<WorkLocationEventItem['eventType'], string> = {
  OFFICE_CLOCK_IN: 'Started in office',
  OFFSITE_STARTED: 'Went off-site',
  RETURNED_TO_OFFICE: 'Returned to office',
  OFFSITE_LOCATION_CHANGED: 'Moved to another site',
  ADMIN_CORRECTION: 'Correction by HR',
};

/**
 * Who is where, today. Read-only for Line Managers (scoped to their reports by
 * the API) and correctable by HR/Admin.
 *
 * Corrections never rewrite history — they append an ADMIN_CORRECTION row and
 * close the offending period, so the drawer keeps showing what was originally
 * recorded alongside the fix.
 */
export function WorkLocations() {
  const [date, setDate] = useState(todayISO());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'OFFSITE' | 'OFFICE' | 'ABSENT'>('ALL');
  const [selected, setSelected] = useState<LocationBoardRow | null>(null);

  const { data, isLoading } = useLocationBoard(date);
  const rows = data?.rows ?? [];

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (term) {
        const haystack = [r.fullName, r.employeeIdCode, r.department, r.placeName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (filter === 'OFFSITE') return r.locationType === 'OFFSITE';
      if (filter === 'OFFICE') return r.clockInTime !== null && r.locationType === 'OFFICE';
      if (filter === 'ABSENT') return r.clockInTime === null;
      return true;
    });
  }, [rows, query, filter]);

  const isToday = date === todayISO();

  return (
    <div className="wloc">
      <div className="wloc-head">
        <div>
          <h1>Work locations</h1>
          <p className="muted">
            {data?.scope === 'TEAM'
              ? 'Your direct reports, and where each of them is working from.'
              : 'Everyone clocked in today, and where each of them is working from.'}
          </p>
        </div>
        <Field label="Date" className="wloc-date">
          <TextInput
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value || todayISO())}
          />
        </Field>
      </div>

      <div className="wloc-stats">
        <StatCard
          label="On the board"
          value={data?.totals.employees ?? '—'}
          icon={<Users size={15} />}
          accent="muted"
        />
        <StatCard
          label="In office"
          value={data?.totals.inOffice ?? '—'}
          icon={<Building2 size={15} />}
          accent="success"
        />
        <StatCard
          label="Off-site"
          value={data?.totals.offsite ?? '—'}
          icon={<Navigation size={15} />}
          accent="warning"
          hint={isToday ? 'Working away from the office right now' : undefined}
        />
        <StatCard
          label="Not clocked in"
          value={data?.totals.notClockedIn ?? '—'}
          icon={<UserX size={15} />}
          accent="muted"
        />
      </div>

      <div className="wloc-toolbar">
        <div className="wloc-search">
          <Search size={14} />
          <input
            className="input"
            value={query}
            placeholder="Search name, ID, department or place…"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the location board"
          />
        </div>
        <div className="wloc-tabs" role="tablist">
          {(
            [
              ['ALL', 'Everyone'],
              ['OFFSITE', 'Off-site'],
              ['OFFICE', 'In office'],
              ['ABSENT', 'Not clocked in'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              className={cx('wloc-tab', filter === key && 'wloc-tab-on')}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="muted">Loading the board…</div>}

      {!isLoading && visible.length === 0 && (
        <EmptyState
          icon={<MapPin size={26} />}
          title="Nothing to show for this day"
          body={
            rows.length === 0
              ? 'No attendance was recorded on this date.'
              : 'No one matches the current filters.'
          }
        />
      )}

      {visible.length > 0 && (
        <div className="wloc-table" role="table">
          <div className="wloc-row wloc-row-head" role="row">
            <span>Employee</span>
            <span>Status</span>
            <span>Working from</span>
            <span>Since</span>
            <span>Clock in / out</span>
            <span />
          </div>
          {visible.map((r) => (
            <motion.div
              className="wloc-row"
              role="row"
              key={r.employeeId}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="wloc-emp">
                <Avatar
                  initials={initials(r.fullName)}
                  color={avatarColorFor(r.employeeId)}
                  size="sm"
                />
                <span className="wloc-emp-text">
                  <strong>{r.fullName}</strong>
                  <em>
                    {[r.employeeIdCode, r.department].filter(Boolean).join(' · ') || '—'}
                  </em>
                </span>
              </span>

              <span>
                <StatusBadge row={r} />
                {r.autoClosedToday && (
                  <span className="wloc-flag" title="An off-site period was auto-closed at clock-out">
                    <AlertTriangle size={12} /> auto-closed
                  </span>
                )}
              </span>

              <span className="wloc-place">
                {r.locationType === 'OFFSITE' ? (
                  <>
                    <strong>{r.placeName ?? 'Off-site'}</strong>
                    {r.formattedAddress && <em>{r.formattedAddress}</em>}
                    {r.purpose && <em className="wloc-purpose">{r.purpose}</em>}
                  </>
                ) : (
                  <span className="muted">
                    {r.clockInTime ? 'Trace office, Dhaka' : '—'}
                  </span>
                )}
              </span>

              <span className="wloc-since">
                {r.startedAt ? (
                  <>
                    {fmtTime(r.startedAt)}
                    {r.durationMinutes !== null && (
                      <em>{fmtDuration(r.durationMinutes)}</em>
                    )}
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>

              <span className="wloc-clock mono">
                {r.clockInTime ? fmtTime(r.clockInTime) : '—'}
                {' → '}
                {r.clockOutTime ? fmtTime(r.clockOutTime) : '…'}
              </span>

              <span>
                <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                  View day
                </Button>
              </span>
            </motion.div>
          ))}
        </div>
      )}

      <DayDrawer
        row={selected}
        date={date}
        canCorrect={data?.canCorrect ?? false}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function StatusBadge({ row }: { row: LocationBoardRow }) {
  if (row.clockInTime === null) return <Badge variant="default">Not clocked in</Badge>;
  if (row.locationType === 'OFFSITE')
    return (
      <Badge variant="warning" leadingIcon={<Navigation size={11} />}>
        Off-site
      </Badge>
    );
  return (
    <Badge variant="success" leadingIcon={<Building2 size={11} />}>
      In office
    </Badge>
  );
}

// ─── Day drawer ───────────────────────────────────────────

interface DrawerProps {
  row: LocationBoardRow | null;
  date: string;
  canCorrect: boolean;
  onClose: () => void;
}

function DayDrawer({ row, date, canCorrect, onClose }: DrawerProps) {
  const range = useMemo(() => ({ from: date, to: date }), [date]);
  // The drawer stays mounted so it can animate out; the query must not run while
  // it is closed, or every board visit would also fetch the viewer's own day.
  const { data, isLoading } = useWorkLocation(row?.employeeId, range, row !== null);
  const correct = useCorrectLocation();
  const addToast = useStore((s) => s.addToast);

  const [correcting, setCorrecting] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // The API returns newest-first; a day reads better forwards.
  const events = useMemo(() => [...(data?.history ?? [])].reverse(), [data]);

  const submitCorrection = (eventId: string) => {
    if (note.trim().length < 4) return;
    correct.mutate(
      { eventId, note: note.trim() },
      {
        onSuccess: () => {
          addToast({
            kind: 'success',
            title: 'Correction recorded',
            body: 'The original entry is kept alongside your note.',
          });
          setCorrecting(null);
          setNote('');
        },
        onError: (e: Error) =>
          addToast({ kind: 'error', title: 'Could not record correction', body: e.message }),
      },
    );
  };

  return (
    <Drawer
      open={row !== null}
      onClose={onClose}
      width={520}
      title={row?.fullName ?? 'Location history'}
      subtitle={`Location events on ${fmtDate(date)}`}
    >
      {isLoading && <div className="muted">Loading…</div>}

      {!isLoading && events.length === 0 && (
        <div className="muted">No location events were recorded on this day.</div>
      )}

      <ul className="wloc-events">
        {events.map((e) => (
          <li key={e.id} className={cx(e.eventType === 'ADMIN_CORRECTION' && 'wloc-event-fix')}>
            <div className="wloc-event-head">
              <span className="wloc-event-time mono">{fmtTime(e.startedAt)}</span>
              <strong>{EVENT_LABEL[e.eventType] ?? e.eventType}</strong>
              <span className="wloc-event-dur">
                {e.durationMinutes === null
                  ? e.eventType === 'ADMIN_CORRECTION'
                    ? ''
                    : 'ongoing'
                  : fmtDuration(e.durationMinutes)}
              </span>
            </div>

            {e.placeName && <div className="wloc-event-place">{e.placeName}</div>}
            {e.formattedAddress && (
              <div className="wloc-event-addr">{e.formattedAddress}</div>
            )}
            {e.purpose && <div className="wloc-event-purpose">{e.purpose}</div>}

            <div className="wloc-event-meta">
              {e.autoClosed && (
                <span className="wloc-flag">
                  <AlertTriangle size={11} /> auto-closed at clock-out
                </span>
              )}
              {e.byOther && e.createdBy && <span>recorded by {e.createdBy.fullName}</span>}
              {e.latitude !== null && e.longitude !== null && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <MapPin size={11} /> open in Maps
                </a>
              )}
            </div>

            {canCorrect && e.eventType !== 'ADMIN_CORRECTION' && (
              <div className="wloc-event-fixer">
                {correcting === e.id ? (
                  <>
                    <Field
                      label="What was wrong?"
                      hint="Stored with your name. The original times are not overwritten."
                    >
                      <TextArea
                        rows={2}
                        maxLength={200}
                        value={note}
                        placeholder="e.g. Returned to office at 3 PM but forgot to switch back."
                        onChange={(ev) => setNote(ev.target.value)}
                      />
                    </Field>
                    <div className="wloc-event-fix-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCorrecting(null);
                          setNote('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={correct.isPending}
                        disabled={note.trim().length < 4}
                        onClick={() => submitCorrection(e.id)}
                      >
                        Record correction
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={<Wrench size={13} />}
                    onClick={() => {
                      setCorrecting(e.id);
                      setNote('');
                    }}
                  >
                    Correct this entry
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
