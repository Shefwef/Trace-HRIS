'use client';
import { useEffect, useRef } from 'react';
import { MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import { OSM_MAP_STYLE } from '@/lib/geoapify';
import 'maplibre-gl/dist/maplibre-gl.css';

/** Matches the report headers and the rest of the brand. */
const PIN_COLOR = '#2c5282';

interface Props {
  /** Where to open. Read once — later changes must not yank the user's view. */
  center: { lat: number; lng: number };
  marker: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
}

/**
 * A deliberately plain vector map: pan, zoom, drop a pin. Nothing else.
 *
 * Loaded through `next/dynamic` so none of MapLibre reaches the browser until
 * somebody actually opens the location modal — Attendance, Reports and the
 * dashboard all render without a byte of it.
 *
 * Everything switched off below is switched off on purpose. Rotation and pitch
 * turn a two-second "yes, that's the place" confirmation into a fiddly toy you
 * can leave tilted; the compass exists only to undo a rotation that can no
 * longer happen; and `maxZoom` stops the map fetching street-furniture detail
 * nobody needs to confirm an office. Camera moves use `jumpTo`, not `flyTo`, so
 * picking a search result lands instantly instead of animating across Dhaka.
 *
 * Attribution is left at its default because OSM's ODbL and Geoapify's free
 * tier both require it. MapLibre collapses it automatically below 640px, which
 * this modal always is.
 */
export default function LocationMap({ center, marker, onPick }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pin = useRef<Marker | null>(null);

  // Held in a ref so a new closure from the parent cannot retrigger the effect
  // below: rebuilding a WebGL context on every keystroke would be both slow and
  // visibly ugly.
  const pick = useRef(onPick);
  pick.current = onPick;

  const start = useRef(center);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const m = new MapLibreMap({
      container: el,
      style: OSM_MAP_STYLE,
      center: [start.current.lng, start.current.lat],
      zoom: 12,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.on('click', (e) => pick.current(e.lngLat.lat, e.lngLat.lng));
    map.current = m;

    return () => {
      m.remove();
      map.current = null;
      pin.current = null;
    };
  }, []);

  // One Marker, moved — not destroyed and rebuilt. Recreating it would drop and
  // re-add a DOM node on every selection for no visible benefit.
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    if (!marker) {
      pin.current?.remove();
      pin.current = null;
      return;
    }

    const at: [number, number] = [marker.lng, marker.lat];
    if (pin.current) {
      pin.current.setLngLat(at);
    } else {
      pin.current = new Marker({ color: PIN_COLOR }).setLngLat(at).addTo(m);
    }
    // Zoom in only on the first pin; after that respect wherever the user has
    // panned to, and just recentre.
    m.jumpTo({ center: at, zoom: Math.max(m.getZoom(), 15) });
  }, [marker]);

  return <div ref={host} className="wlm-canvas" />;
}
