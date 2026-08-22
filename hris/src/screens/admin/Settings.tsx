'use client';
import { useEffect, useState } from 'react';
import { Save, Clock, Mail, Users, Fingerprint, Info, FlaskConical } from 'lucide-react';
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
          <p className="muted">Company-wide configuration for HRIS.</p>
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
            <h3>Sender email</h3>
            <p>The email address every HRIS notification is sent from and reply-to. Change this once you have a verified company domain.</p>
            <Field label="Sender name" hint="Shown as the from-name in the recipient's inbox.">
              <TextInput
                value={value('senderName') ?? ''}
                onChange={(e) => setField('senderName', e.target.value)}
                placeholder="Trace HRIS"
              />
            </Field>
            <Field label="Reply-to email" hint="Where responses go. Should be a monitored inbox.">
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
              <FlaskConical size={18} />
            </div>
            <h3>
              QA mode {value('qaRedirectEmail') ? <Badge variant="warning">Active</Badge> : <Badge>Off</Badge>}
            </h3>
            <p>
              When set, every outgoing HRIS email is redirected to this single inbox instead of the real recipient. The original To / Cc are preserved in the email body and subject prefix. Perfect for end-to-end testing before real employee inboxes are wired up. <strong>Clear this field to return to normal delivery.</strong>
            </p>
            <Field
              label="Redirect all emails to"
              hint="Leave empty for normal (per-recipient) delivery."
            >
              <TextInput
                type="email"
                value={value('qaRedirectEmail') ?? ''}
                onChange={(e) => setField('qaRedirectEmail', e.target.value)}
                placeholder="shefayatadib@iut-dhaka.edu"
              />
            </Field>
          </section>

          <section className="card stg-card">
            <div className="stg-card-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
              <Clock size={18} />
            </div>
            <h3>Working hours</h3>
            <p>Used for the attendance widget and overtime calculation.</p>
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
            <Field label="Standard hours per day" hint="Full work day length. Used for overtime and duration math.">
              <TextInput
                type="number"
                min={1}
                max={24}
                value={value('standardHoursPerDay') ?? 8}
                onChange={(e) => setField('standardHoursPerDay', Number(e.target.value))}
              />
            </Field>
            <Field label="Overtime threshold (minutes)" hint="Minutes worked beyond this count as overtime.">
              <TextInput
                type="number"
                min={0}
                max={24 * 60}
                value={value('overtimeThresholdMinutes') ?? 480}
                onChange={(e) => setField('overtimeThresholdMinutes', Number(e.target.value))}
              />
            </Field>
          </section>

          <section className="card stg-card">
            <div className="stg-card-icon" style={{ background: 'var(--color-leave-casual-light)', color: 'var(--color-leave-casual)' }}>
              <Users size={18} />
            </div>
            <h3>Leave policy</h3>
            <p>Baseline leave quotas for each new cycle.</p>
            <div className="stg-row"><span>Casual leave per cycle</span><strong>12 days</strong></div>
            <div className="stg-row"><span>Sick leave per cycle</span><strong>12 days</strong></div>
            <div className="stg-row"><span>Replacement leave</span><strong>Earned from approved extra work</strong></div>
            <div className="stg-row"><span>Cycle start</span><strong>Per employee (edit from Employees page)</strong></div>
            <div className="stg-row"><span>Carry-over</span><strong>Disabled</strong></div>
          </section>

          <section className="card stg-card">
            <div className="stg-card-icon" style={{ background: 'var(--color-leave-replacement-light)', color: 'var(--color-leave-replacement)' }}>
              <Info size={18} />
            </div>
            <h3>Roles</h3>
            <p>Who can do what across the system.</p>
            <div className="stg-row"><span>Super Admin</span><strong>Everything · audit logs</strong></div>
            <div className="stg-row"><span>Admin (CEO/CTO)</span><strong>Approve, manage, send notices</strong></div>
            <div className="stg-row"><span>HR</span><strong>Approve, invite, holidays</strong></div>
            <div className="stg-row"><span>Employee</span><strong>Apply, clock in, view own</strong></div>
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
