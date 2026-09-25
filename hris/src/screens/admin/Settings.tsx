'use client';
import { useEffect, useState } from 'react';
import { Save, Clock, Mail, Fingerprint, Info } from 'lucide-react';
import { useSettings, useUpdateSettings, type SystemSettings } from '@/lib/hooks';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import './Settings.css';

export function AdminSettings() {
  const { data: settings, isLoading } = useSettings();
  const update = useUpdateSettings();

  const [form, setForm] = useState<Partial<SystemSettings>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setForm({});
  }, [settings]);

  function setField<K extends keyof SystemSettings>(k: K, v: SystemSettings[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  function value<K extends keyof SystemSettings>(k: K): SystemSettings[K] | undefined {
    if (k in form) return form[k] as SystemSettings[K];
    return settings?.[k];
  }

  function save() {
    if (Object.keys(form).length === 0) return;
    setError(null);
    update.mutate(form, {
      onSuccess: () => {
        setSaved(true);
        setForm({});
      },
      onError: (e: Error) => setError(e.message),
    });
  }

  const isDirty = Object.keys(form).length > 0;

  return (
    <div className="stg">
      <div className="stg-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Company-wide configuration for HRMS.</p>
        </div>
        <div className="stg-head-actions">
          {saved && !isDirty && <span className="stg-saved">✓ Saved</span>}
          <Button
            variant="primary"
            leadingIcon={<Save size={16} />}
            loading={update.isPending}
            disabled={!isDirty}
            onClick={save}
          >
            Save changes
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--color-danger-light)', color: 'var(--color-danger)', borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      {isLoading || !settings ? (
        <div className="muted">Loading settings…</div>
      ) : (
        <div className="stg-grid">
          <section className="card stg-card">
            <div className="stg-card-icon" style={{ background: 'var(--color-info-light)', color: 'var(--color-brand-primary)' }}>
              <Mail size={18} />
            </div>
            <h3>
              Email addresses <Badge variant="info">HR + Admin</Badge>
            </h3>
            <p>
              HR, Admin, and Super Admin can update the addresses HRMS uses for every outgoing
              notification. Changes take effect immediately for new emails.
            </p>
            <Field label="Sender name" hint="Shown as the from-name in the recipient's inbox.">
              <TextInput
                value={value('senderName') ?? ''}
                onChange={(e) => setField('senderName', e.target.value)}
                placeholder="TRACE HRMS"
              />
            </Field>
            <Field label="Reply-to address" hint="Where employee replies land. Should be a monitored inbox (e.g. HR).">
              <TextInput
                type="email"
                value={value('senderEmail') ?? ''}
                onChange={(e) => setField('senderEmail', e.target.value)}
                placeholder="hr@company.com"
              />
            </Field>
            <Field label="From address" hint="Must be verified in Resend. Use onboarding@resend.dev until you verify a domain.">
              <TextInput
                type="email"
                value={value('fromEmail') ?? ''}
                onChange={(e) => setField('fromEmail', e.target.value)}
                placeholder="onboarding@resend.dev"
              />
            </Field>
          </section>

          <section className="card stg-card">
            <div className="stg-card-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
              <Clock size={18} />
            </div>
            <h3>Working hours</h3>
            <p>
              The office window. Standard hours per day are derived from
              End − Start; anything worked beyond that counts as overtime,
              anything short counts as deficit.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Start time">
                <TextInput
                  type="time"
                  value={value('workStartTime') ?? '09:00'}
                  onChange={(e) => setField('workStartTime', e.target.value)}
                />
              </Field>
              <Field label="End time">
                <TextInput
                  type="time"
                  value={value('workEndTime') ?? '17:00'}
                  onChange={(e) => setField('workEndTime', e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="card stg-card">
            <div className="stg-card-icon" style={{ background: 'var(--color-leave-replacement-light)', color: 'var(--color-leave-replacement)' }}>
              <Info size={18} />
            </div>
            <h3>Roles</h3>
            <p>The five roles available across the system.</p>
            <div className="stg-row"><span>Super Admin</span></div>
            <div className="stg-row"><span>Admin</span></div>
            <div className="stg-row"><span>Line Manager</span></div>
            <div className="stg-row"><span>HR</span></div>
            <div className="stg-row"><span>Employee</span></div>
          </section>

          <section className="card stg-card stg-card-wide">
            <div className="stg-card-icon" style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>
              <Fingerprint size={18} />
            </div>
            <h3>Biometric integration <Badge variant="info">Ready</Badge></h3>
            <p>
              Attendance accepts biometric input via the same API endpoints (POST /api/attendance/clock-in and /clock-out).
              When a scanner is enrolled it posts <span className="mono">{`{ source: "BIOMETRIC", biometricDeviceId, timestamp }`}</span> — no logic changes required.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
