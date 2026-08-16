import { Clock, Calendar as CalendarIcon, Users, Bell, Fingerprint } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import './Settings.css';

export function AdminSettings() {
  return (
    <div className="stg">
      <div className="stg-head">
        <h1>Settings</h1>
        <p className="muted">Company-wide configuration for HRIS.</p>
      </div>

      <div className="stg-grid">
        <div className="card stg-card">
          <div className="stg-card-icon" style={{ background: 'var(--color-info-light)', color: 'var(--color-brand-primary)' }}>
            <Clock size={18} />
          </div>
          <h3>Working hours</h3>
          <p>09:00 – 17:00 · 8 hrs/day · 60 min break · Overtime threshold 8h</p>
          <div className="stg-row"><span>Standard hours per day</span><strong>8 hours</strong></div>
          <div className="stg-row"><span>Work days</span><strong>Mon – Fri</strong></div>
        </div>

        <div className="card stg-card">
          <div className="stg-card-icon" style={{ background: 'var(--color-leave-casual-light)', color: 'var(--color-leave-casual)' }}>
            <CalendarIcon size={18} />
          </div>
          <h3>Leave policy</h3>
          <p>12 casual + 12 sick days per cycle. Replacement earned from overtime.</p>
          <div className="stg-row"><span>Cycle start</span><strong>Per employee (default Jan 1)</strong></div>
          <div className="stg-row"><span>Carry-over</span><strong>Disabled</strong></div>
        </div>

        <div className="card stg-card">
          <div className="stg-card-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
            <Bell size={18} />
          </div>
          <h3>Notifications</h3>
          <p>Default channels for outgoing messages.</p>
          <div className="stg-row"><span>Leave requests</span><strong>Email + In-app</strong></div>
          <div className="stg-row"><span>Holidays</span><strong>Email + In-app</strong></div>
        </div>

        <div className="card stg-card">
          <div className="stg-card-icon" style={{ background: 'var(--color-leave-replacement-light)', color: 'var(--color-leave-replacement)' }}>
            <Users size={18} />
          </div>
          <h3>Roles</h3>
          <p>Who can do what across the system.</p>
          <div className="stg-row"><span>Super Admin</span><strong>Everything · audit logs</strong></div>
          <div className="stg-row"><span>Admin (HR / CEO)</span><strong>Approve, manage, send notices</strong></div>
          <div className="stg-row"><span>Employee</span><strong>Apply, clock in, view own</strong></div>
        </div>

        <div className="card stg-card stg-card-wide">
          <div className="stg-card-icon" style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>
            <Fingerprint size={18} />
          </div>
          <h3>Biometric integration <Badge variant="info">Ready</Badge></h3>
          <p>
            Attendance is architected to accept biometric input via the same API endpoints (POST /attendance/clock-in and /clock-out).
            When a scanner is enrolled, it posts <span className="mono">{`{ source: "BIOMETRIC", biometric_device_id, biometric_verified, timestamp }`}</span> — no logic changes required.
          </p>
        </div>
      </div>
    </div>
  );
}
