'use client';
import dynamic from 'next/dynamic';
import { Building2, Navigation } from 'lucide-react';
import { useWorkLocation } from '@/lib/hooks';
import { OFFICE, OFFICE_CENTER } from '@/lib/office';
import './DashboardLocationMap.css';

const DashboardMapView = dynamic(() => import('./DashboardMapView'), {
  ssr: false,
  loading: () => <div className="dlm-canvas dlm-canvas-loading" />,
});

export function DashboardLocationMap() {
  const { data } = useWorkLocation();

  const isOffsite = data?.current?.type === 'OFFSITE';
  const open = data?.current?.open ?? null;

  const offsite =
    isOffsite && open?.latitude != null && open?.longitude != null
      ? { lat: open.latitude, lng: open.longitude, placeName: open.placeName ?? 'Off-site' }
      : null;

  return (
    <section className="dlm card">
      <div className="dlm-head">
        <h3>Location map</h3>
        <span className="dlm-status">
          {offsite ? (
            <>
              <Navigation size={13} />
              {offsite.placeName}
            </>
          ) : (
            <>
              <Building2 size={13} />
              {OFFICE.name}
            </>
          )}
        </span>
      </div>

      <div className="dlm-canvas">
        <DashboardMapView office={OFFICE_CENTER} offsite={offsite} />
      </div>

      <div className="dlm-footer">
        <div className="dlm-legend">
          <span>
            <span className="dlm-dot" style={{ background: '#2c5282' }} />
            Office — {OFFICE_CENTER.lat.toFixed(4)}, {OFFICE_CENTER.lng.toFixed(4)}
          </span>
          {offsite && (
            <span>
              <span className="dlm-dot" style={{ background: '#c05621' }} />
              {offsite.placeName}
            </span>
          )}
        </div>
        <span className="dlm-hint">
          Set <code>NEXT_PUBLIC_OFFICE_LAT</code> / <code>NEXT_PUBLIC_OFFICE_LNG</code> in .env.local to fix the pin.
        </span>
      </div>
    </section>
  );
}
