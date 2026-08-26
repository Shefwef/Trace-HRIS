'use client';
import { useEffect, useMemo, useState } from 'react';
import { Building2, MapPin, Navigation, AlertTriangle, History } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWorkLocation, useReturnToOffice, type WorkLocationEventItem } from '@/lib/hooks';
import { OFFICE } from '@/lib/office';
import { useStore } from '@/lib/store';
import { Button } from '../ui/Button';
import { WorkLocationModal } from './WorkLocationModal';
import { fmtDuration, fmtTime } from '../../lib/utils';
import './WorkLocationCard.css';

const EVENT_LABEL: Record<string, string> = {
  OFFICE_CLOCK_IN: 'Started in office',
  OFFSITE_STARTED: 'Went off-site',
  RETURNED_TO_OFFICE: 'Returned to office',
  OFFSITE_LOCATION_CHANGED: 'Moved to another site',
  ADMIN_CORRECTION: 'Corrected by HR',
};

/**
 * Where am I working right now? Sits beside the attendance widget.
 *
 * Location is deliberately not a substitute for attendance: clocking in is what
 * starts the day, and this card only answers "and where are you doing it from".
 * It therefore stays read-only until the employee has clocked in.
 */
export function WorkLocationCard() {
  const { data, isLoading } = useWorkLocation();
  const returnToOffice = useReturnToOffice();
  const addToast = useStore((s) => s.addToast);
  const [modalOpen, setModalOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Re-render every 30s so the "off-site for 1h 20m" line stays honest without
  // refetching — the query itself refreshes on its own minute interval.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const current = data?.current;
  const open = current?.open ?? null;
  const isClockedIn = !!(current?.clockInTime && !current?.clockOutTime);
  const isClockedOut = !!current?.clockOutTime;
  const isOffsite = current?.type === 'OFFSITE';

  const todayEvents = useMemo(() => {
    if (!data) return [];
    return data.history.filter((e) => e.dayKey === data.date);
  }, [data]);

  const autoClosed = todayEvents.some((e) => e.autoClosed);

  const minutesHere = open
    ? Math.max(0, Math.round((Date.now() - new Date(open.startedAt).getTime()) / 60_000))
    : null;

  if (isLoading && !data) {
    return <div className="wlc wlc-skeleton" aria-busy="true" />;
  }

  return (
    <motion.div
      className={`wlc ${isOffsite ? 'wlc-offsite' : 'wlc-office'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="wlc-head">
        <span className="wlc-head-title">
          {isOffsite ? <Navigation size={15} /> : <Building2 size={15} />}
          Work location
        </span>
        {todayEvents.length > 0 && (
          <button
            className="wlc-hist-toggle"
            onClick={() => setShowHistory((s) => !s)}
            aria-expanded={showHistory}
          >
            <History size={13} />
            {showHistory ? 'Hide' : `Today (${todayEvents.length})`}
          </button>
        )}
      </div>

      <div className="wlc-body">
        <div className="wlc-state">{isOffsite ? 'Off-site' : 'In office'}</div>
        {isOffsite && open ? (
          <>
            <div className="wlc-place">{open.placeName}</div>
            {open.formattedAddress && (
              <div className="wlc-address">
                <MapPin size={12} /> {open.formattedAddress}
              </div>
            )}
            {open.purpose && <div className="wlc-purpose">{open.purpose}</div>}
            <div className="wlc-elapsed">
              Since {fmtTime(open.startedAt)}
              {minutesHere !== null && ` · ${fmtDuration(minutesHere)} so far`}
            </div>
          </>
        ) : isClockedIn ? (
          // Mirrors the off-site branch above — name then address — so switching
          // location changes what the card says, not how it is laid out.
          <>
            <div className="wlc-place">{OFFICE.name}</div>
            <div className="wlc-address">
              <MapPin size={12} /> {OFFICE.address}
            </div>
          </>
        ) : (
          <div className="wlc-address wlc-address-plain">
            {isClockedOut
              ? 'Session complete for today.'
              : 'Clock in to start tracking your work location.'}
          </div>
        )}
      </div>

      {autoClosed && (
        <div className="wlc-warn">
          <AlertTriangle size={13} />
          An off-site period was closed automatically at clock-out. Ask HR to correct it
          if the timing is wrong.
        </div>
      )}

      {showHistory && todayEvents.length > 0 && (
        <ul className="wlc-timeline">
          {[...todayEvents].reverse().map((e) => (
            <li key={e.id}>
              <span className="wlc-tl-time">{fmtTime(e.startedAt)}</span>
              <span className="wlc-tl-label">
                {EVENT_LABEL[e.eventType] ?? e.eventType}
                {e.placeName ? ` · ${e.placeName}` : ''}
                {e.autoClosed && <em> (auto-closed)</em>}
              </span>
              <span className="wlc-tl-dur">{durationLabel(e)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="wlc-actions">
        {isClockedIn && (
          <>
            <Button
              variant={isOffsite ? 'secondary' : 'primary'}
              size="sm"
              leadingIcon={<MapPin size={14} />}
              onClick={() => setModalOpen(true)}
            >
              {isOffsite ? 'Change location' : 'Change work location'}
            </Button>
            {isOffsite && (
              <Button
                variant="success"
                size="sm"
                leadingIcon={<Building2 size={14} />}
                loading={returnToOffice.isPending}
                onClick={() =>
                  returnToOffice.mutate(undefined, {
                    onSuccess: (res) =>
                      addToast({
                        kind: 'success',
                        title: 'Back in office',
                        body: `${fmtDuration(res.offsiteMinutes)} recorded off-site.`,
                      }),
                    onError: (e: Error) =>
                      addToast({
                        kind: 'error',
                        title: 'Could not update location',
                        body: e.message,
                      }),
                  })
                }
              >
                Return to office
              </Button>
            )}
          </>
        )}
        {!isClockedIn && (
          <Button variant="secondary" size="sm" disabled>
            {isClockedOut ? 'Day complete' : 'Clock in first'}
          </Button>
        )}
      </div>

      <WorkLocationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentPlaceName={open?.placeName ?? null}
      />
    </motion.div>
  );
}

function durationLabel(e: WorkLocationEventItem): string {
  if (e.eventType === 'ADMIN_CORRECTION') return '';
  if (e.durationMinutes === null) return 'ongoing';
  return fmtDuration(e.durationMinutes);
}
