'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Search, Loader2, Info } from 'lucide-react';
import { useStartOffsite, type StartOffsitePayload } from '@/lib/hooks';
import { MAPS_ENABLED, searchPlaces, reverseGeocode, type PlaceHit } from '@/lib/geoapify';
import { OFFICE_CENTER } from '@/lib/office';
import { useStore } from '@/lib/store';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, TextInput, TextArea } from '../ui/Field';
import './WorkLocationModal.css';

/**
 * MapLibre is ~200KB of WebGL renderer. Splitting it out here means Attendance,
 * Reports and the dashboard never download it — the chunk arrives the first time
 * somebody opens this modal, and the browser caches it from then on. `ssr: false`
 * because MapLibre touches `window` on construction.
 */
const LocationMap = dynamic(() => import('./LocationMap'), {
  ssr: false,
  loading: () => <div className="wlm-canvas wlm-canvas-loading" />,
});

interface Selection {
  placeId?: string;
  placeName: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Shown as context when the employee is moving from one site to another. */
  currentPlaceName?: string | null;
}

export function WorkLocationModal({ open, onClose, currentPlaceName }: Props) {
  const startOffsite = useStartOffsite();
  const addToast = useStore((s) => s.addToast);

  const [selection, setSelection] = useState<Selection>({ placeName: '' });
  const [purpose, setPurpose] = useState('');
  const [touched, setTouched] = useState(false);

  // Reset whenever the modal is reopened — a stale destination from last time
  // is worse than an empty form.
  useEffect(() => {
    if (open) {
      setSelection({ placeName: '' });
      setPurpose('');
      setTouched(false);
    }
  }, [open]);

  const nameError =
    touched && selection.placeName.trim().length < 2
      ? 'Tell us where you are going (at least 2 characters).'
      : undefined;

  const submit = () => {
    setTouched(true);
    if (selection.placeName.trim().length < 2) return;

    const payload: StartOffsitePayload = {
      placeName: selection.placeName.trim(),
      ...(selection.placeId ? { placeId: selection.placeId } : {}),
      ...(selection.formattedAddress
        ? { formattedAddress: selection.formattedAddress.trim() }
        : {}),
      ...(selection.latitude !== undefined ? { latitude: selection.latitude } : {}),
      ...(selection.longitude !== undefined ? { longitude: selection.longitude } : {}),
      ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
    };

    startOffsite.mutate(payload, {
      onSuccess: (res) => {
        addToast({
          kind: 'success',
          title:
            res.eventType === 'OFFSITE_LOCATION_CHANGED'
              ? 'Location updated'
              : 'Off-site work started',
          body: `Recorded at ${payload.placeName}.`,
        });
        onClose();
      },
      onError: (e: Error) =>
        addToast({ kind: 'error', title: 'Could not update location', body: e.message }),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Change work location"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={startOffsite.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            leadingIcon={<MapPin size={15} />}
            loading={startOffsite.isPending}
            onClick={submit}
          >
            {currentPlaceName ? 'Move to this location' : 'Start off-site work'}
          </Button>
        </>
      }
    >
      <div className="wlm">
        {currentPlaceName && (
          <div className="wlm-note">
            <Info size={14} />
            <span>
              You are currently recorded at <strong>{currentPlaceName}</strong>. Picking a
              new destination closes that period and starts a new one.
            </span>
          </div>
        )}

        {MAPS_ENABLED ? (
          <>
            {/* Mounted only while open so the map is torn down on close rather
                than left holding a WebGL context behind a hidden modal. */}
            {open && <PlacePicker selection={selection} onSelect={setSelection} />}
            <Field
              label="Destination"
              required
              error={nameError}
              hint="Edit if the map name is not how your team refers to this site."
            >
              <TextInput
                value={selection.placeName}
                placeholder="Search above, or type a name"
                onChange={(e) =>
                  setSelection((s) => ({ ...s, placeName: e.target.value }))
                }
              />
            </Field>
          </>
        ) : (
          <>
            <div className="wlm-note wlm-note-muted">
              <Info size={14} />
              <span>
                Map search is not configured on this deployment, so type the destination
                below. Everything else works the same.
              </span>
            </div>
            <Field label="Destination" required error={nameError}>
              <TextInput
                value={selection.placeName}
                placeholder="e.g. Ministry of Finance, Secretariat"
                onChange={(e) =>
                  setSelection((s) => ({ ...s, placeName: e.target.value }))
                }
              />
            </Field>
            <Field label="Address" hint="Optional — helps HR recognise the site later.">
              <TextInput
                value={selection.formattedAddress ?? ''}
                placeholder="Area, road, city"
                onChange={(e) =>
                  setSelection((s) => ({ ...s, formattedAddress: e.target.value }))
                }
              />
            </Field>
          </>
        )}

        <Field
          label="Purpose"
          hint="Optional. Appears on HR's location board and in the monthly report."
        >
          <TextArea
            rows={2}
            maxLength={200}
            value={purpose}
            placeholder="Client meeting, site visit, document submission…"
            onChange={(e) => setPurpose(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Geoapify-backed picker ───────────────────────────────

interface PickerProps {
  selection: Selection;
  onSelect: (s: Selection) => void;
}

/**
 * Search box plus map. Two ways in, because OpenStreetMap's Dhaka coverage
 * cannot be relied on: search for what it knows, drop a pin for what it does not.
 */
function PlacePicker({ selection, onSelect }: PickerProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced, and the previous request is aborted rather than left to land out
  // of order — each keystroke costs a credit, and a stale response overwriting a
  // fresh one is the classic autocomplete bug.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setHits([]);
      setError(null);
      return;
    }

    const ac = new AbortController();
    const id = setTimeout(() => {
      setSearching(true);
      setError(null);
      searchPlaces(term, OFFICE_CENTER, ac.signal)
        .then(setHits)
        .catch((e: unknown) => {
          if (ac.signal.aborted) return;
          setHits([]);
          setError(
            e instanceof Error
              ? `${e.message} You can still drop a pin or type the name.`
              : 'Search unavailable. Drop a pin or type the name instead.',
          );
        })
        .finally(() => {
          if (!ac.signal.aborted) setSearching(false);
        });
    }, 350);

    return () => {
      ac.abort();
      clearTimeout(id);
    };
  }, [query]);

  /**
   * Unlike Google's Places SDK, Geoapify already returns coordinates and a
   * formatted address with each result — so choosing one needs no follow-up
   * details call, and costs no extra credit.
   */
  const choose = (h: PlaceHit) => {
    setHits([]);
    setQuery('');
    onSelect({
      ...(h.placeId ? { placeId: h.placeId } : {}),
      placeName: h.primary,
      ...(h.formatted ? { formattedAddress: h.formatted } : {}),
      ...(h.lat !== undefined ? { latitude: h.lat } : {}),
      ...(h.lon !== undefined ? { longitude: h.lon } : {}),
    });
  };

  /** Map click: drop the pin first, then try to name the spot. */
  const pickPoint = useCallback(
    (lat: number, lng: number) => {
      // Coordinates are recorded immediately. Reverse geocoding is a bonus, so
      // a failure downgrades the label rather than losing the pin.
      onSelect({
        ...selection,
        latitude: lat,
        longitude: lng,
        placeName: selection.placeName || 'Pinned location',
      });
      reverseGeocode(lat, lng)
        .then((hit) => {
          if (!hit) return;
          onSelect({
            ...(hit.placeId ? { placeId: hit.placeId } : {}),
            placeName: selection.placeName || hit.primary,
            ...(hit.formatted ? { formattedAddress: hit.formatted } : {}),
            latitude: lat,
            longitude: lng,
          });
        })
        .catch(() => {
          /* Out of credits or offline — the pin itself is already recorded. */
        });
    },
    [onSelect, selection],
  );

  const marker =
    selection.latitude !== undefined && selection.longitude !== undefined
      ? { lat: selection.latitude, lng: selection.longitude }
      : null;

  return (
    <div className="wlm-picker">
      <div className="wlm-search">
        <span className="wlm-search-icon">
          {searching ? <Loader2 size={15} className="wlm-spin" /> : <Search size={15} />}
        </span>
        <input
          className="input wlm-search-input"
          value={query}
          placeholder="Search for a place in Dhaka…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search for a destination"
        />
        {hits.length > 0 && (
          <ul className="wlm-suggestions">
            {hits.map((h, i) => (
              <li key={h.placeId ?? `${h.primary}-${i}`}>
                <button type="button" onClick={() => choose(h)}>
                  <MapPin size={13} />
                  <span>
                    <strong>{h.primary}</strong>
                    {h.secondary && <em>{h.secondary}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <div className="wlm-search-error">{error}</div>}

      <div className="wlm-map">
        <LocationMap center={marker ?? OFFICE_CENTER} marker={marker} onPick={pickPoint} />
      </div>

      <div className="wlm-coords">
        {marker
          ? `Pin at ${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)} · click the map to adjust`
          : 'Search above, or click the map to drop a pin.'}
      </div>
    </div>
  );
}
