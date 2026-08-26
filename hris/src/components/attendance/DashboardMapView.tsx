'use client';
import { useEffect, useRef } from 'react';
import { MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import { OSM_MAP_STYLE } from '@/lib/geoapify';
import 'maplibre-gl/dist/maplibre-gl.css';

const OFFICE_COLOR = '#2c5282';
const OFFSITE_COLOR = '#c05621';

interface Props {
  office: { lat: number; lng: number };
  offsite?: { lat: number; lng: number } | null;
}

export default function DashboardMapView({ office, offsite }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const offsitePin = useRef<Marker | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const m = new MapLibreMap({
      container: el,
      style: OSM_MAP_STYLE,
      center: [office.lng, office.lat],
      zoom: 15,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      interactive: false, // read-only: disable all mouse/touch interaction
    });
    // Still allow zoom controls for accessibility
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    // Re-enable scroll zoom and drag pan so the user can pan/zoom to explore
    m.scrollZoom.enable();
    m.dragPan.enable();
    new Marker({ color: OFFICE_COLOR }).setLngLat([office.lng, office.lat]).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      offsitePin.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!offsite) {
      offsitePin.current?.remove();
      offsitePin.current = null;
      m.jumpTo({ center: [office.lng, office.lat], zoom: 13 });
      return;
    }
    const at: [number, number] = [offsite.lng, offsite.lat];
    if (offsitePin.current) {
      offsitePin.current.setLngLat(at);
    } else {
      offsitePin.current = new Marker({ color: OFFSITE_COLOR }).setLngLat(at).addTo(m);
    }
    const minLng = Math.min(office.lng, offsite.lng);
    const maxLng = Math.max(office.lng, offsite.lng);
    const minLat = Math.min(office.lat, offsite.lat);
    const maxLat = Math.max(office.lat, offsite.lat);
    m.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, maxZoom: 15 });
  }, [offsite, office]);

  return <div ref={host} style={{ width: '100%', height: '100%' }} />;
}
