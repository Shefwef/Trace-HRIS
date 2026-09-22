'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, Server, Users, AlertCircle, Activity, Play, Plus, CheckCircle2, XCircle, Wifi, WifiOff, ClipboardEdit } from 'lucide-react';
import { api } from '@/lib/hooks';
import { fmtDate, fmtTime, fmtDuration } from '@/lib/utils';
import { localDayKey } from '@/lib/workday';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useCurrentUser } from '@/lib/session';
import { checkPermissionSync } from '@/lib/permissionsMeta';

// ─── Types ───────────────────────────────────────────────

interface DeviceRow {
  id: string; serial: string; alias: string; isActive: boolean;
  lastSeenAt: string | null; punchCount: number; createdAt: string;
}
interface EmployeeRow {
  id: string; fullName: string; department: string | null;
  designation: string | null; employeeIdCode: string | null;
  biometricUserId: string | null;
}
interface SyncLogRow {
  id: string; deviceId: string | null; startedAt: string;
  received: number; applied: number; duplicates: number; unmapped: number; error: string | null;
}
interface SessionRow {
  date: string;
  employeeId: string; employeeName: string;
  employeeIdCode: string | null; department: string | null;
  clockInTime: string | null; clockOutTime: string | null;
  totalWorkedMinutes: number; overtimeMinutes: number; status: string;
}

// ─── Hooks ───────────────────────────────────────────────

function useDevices() {
  return useQuery({ queryKey: ['biometric', 'devices'], queryFn: () => api<DeviceRow[]>('/api/biometric/devices') });
}
function useEmployees() {
  return useQuery({ queryKey: ['biometric', 'employees'], queryFn: () => api<EmployeeRow[]>('/api/biometric/employees') });
}
function useSyncLog() {
  return useQuery({ queryKey: ['biometric', 'sync-log'], queryFn: () => api<SyncLogRow[]>('/api/biometric/sync-log') });
}
function useSessions(params: { date?: string; from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params.date) qs.set('date', params.date);
  if (params.from) qs.set('from', params.from);
  if (params.to)   qs.set('to', params.to);
  const q = qs.toString();
  return useQuery({
    queryKey: ['biometric', 'sessions', q],
    queryFn: () => api<SessionRow[]>(`/api/biometric/sessions?${q}`),
    refetchInterval: 60_000,
  });
}

// ─── Main screen ─────────────────────────────────────────

export function BiometricAdmin() {
  const [tab, setTab] = useState<'punches' | 'devices' | 'mapping' | 'simulate' | 'log'>('punches');
  const user = useCurrentUser();
  const canManage = user ? checkPermissionSync(user, 'biometric.manage') : false;
  const canSimulate = user ? checkPermissionSync(user, 'biometric.simulate') : false;
  const { data: devices } = useDevices();
  const noDevicesYet = Array.isArray(devices) && devices.length === 0;

  return (
    <div className="pg">
      <div className="pg-head">
        <div>
          <h1><Fingerprint size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />Biometric</h1>
          <p className="muted">ZKTeco M2-LR integration — punch ingest, device management, and employee mapping.</p>
        </div>
      </div>

      {noDevicesYet && (
        <div
          role="status"
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            padding: '14px 18px',
            marginBottom: 20,
            background: 'var(--color-info-light, #EBF4FF)',
            border: '1px solid var(--color-info, #3182CE)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <AlertCircle size={18} color="var(--color-info, #3182CE)" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--color-text-primary)' }}>
            <strong>No biometric device connected yet.</strong> This page is ready to receive punches from the office ZKTeco M2-LR — you can register the device serial in the <em>Devices</em> tab, map each employee&apos;s <code>emp_code</code> under <em>Mapping</em>, then either wait for the office agent to POST to <code>/api/biometric/punches</code> or use the <em>Simulate</em> tab to test the full pipeline end-to-end. Once the real device is set up, everything you configure here will start filling in automatically.
          </div>
        </div>
      )}

      <div className="tab-bar" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border-default)', marginBottom: 24 }}>
        {([
          { key: 'punches',  label: 'Punches',   icon: <Activity size={14} /> },
          { key: 'devices',  label: 'Devices',   icon: <Server size={14} /> },
          { key: 'mapping',  label: 'Mapping',   icon: <Users size={14} /> },
          ...(canSimulate ? [{ key: 'simulate', label: 'Simulate', icon: <Play size={14} /> }] : []),
          { key: 'log',      label: 'Sync log',  icon: <CheckCircle2 size={14} /> },
        ] as { key: string; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)',
              borderBottom: tab === t.key ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'devices'  && <DevicesTab canManage={canManage} />}
      {tab === 'mapping'  && <MappingTab canManage={canManage} />}
      {tab === 'punches'  && <PunchesTab />}
      {tab === 'simulate' && canSimulate && <SimulateTab />}
      {tab === 'log'      && <SyncLogTab />}
    </div>
  );
}

// ─── Devices tab ─────────────────────────────────────────

function DevicesTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data: devices, isLoading } = useDevices();
  const [serial, setSerial] = useState('');
  const [alias, setAlias] = useState('');
  const [adding, setAdding] = useState(false);

  const register = useMutation({
    mutationFn: () => api('/api/biometric/devices', { method: 'POST', body: JSON.stringify({ serial, alias }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['biometric', 'devices'] }); setSerial(''); setAlias(''); setAdding(false); },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/biometric/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biometric', 'devices'] }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {canManage && (
        <div className="card" style={{ padding: 20 }}>
          {!adding ? (
            <Button variant="secondary" leadingIcon={<Plus size={16} />} onClick={() => setAdding(true)}>Register device</Button>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Serial number</label>
                <input className="form-input" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="e.g. ABC1234567" style={{ width: 200 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Alias</label>
                <input className="form-input" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. Main entrance" style={{ width: 200 }} />
              </div>
              <Button variant="primary" onClick={() => register.mutate()} loading={register.isPending} disabled={!serial || !alias}>Register</Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-subtle)', textAlign: 'left' }}>
              {['Status', 'Serial', 'Alias', 'Last seen', 'Punches', ...(canManage ? [''] : [])].map((h) => (
                <th key={h} style={{ padding: '10px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</td></tr>
            ) : !devices?.length ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>No devices registered yet. Add one above.</td></tr>
            ) : devices.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid var(--color-border-default)' }}>
                <td style={{ padding: '12px 16px' }}>
                  {d.isActive ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--color-success)' }}><Wifi size={14} /> Active</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--color-text-muted)' }}><WifiOff size={14} /> Inactive</span>}
                </td>
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)' }}>{d.serial}</td>
                <td style={{ padding: '12px 16px' }}>{d.alias}</td>
                <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                  {d.lastSeenAt ? `${fmtDate(d.lastSeenAt, 'EEE d MMM')} ${fmtTime(d.lastSeenAt)}` : '—'}
                </td>
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)' }}>{d.punchCount.toLocaleString()}</td>
                {canManage && (
                  <td style={{ padding: '12px 16px' }}>
                    <Button variant="ghost" size="sm" onClick={() => toggle.mutate({ id: d.id, isActive: !d.isActive })}>
                      {d.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Mapping tab ─────────────────────────────────────────

function MappingTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data: employees, isLoading } = useEmployees();
  const [editing, setEditing] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: ({ id, val }: { id: string; val: string }) =>
      api(`/api/biometric/employees?employeeId=${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ biometricUserId: val || null }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['biometric', 'employees'] }); qc.invalidateQueries({ queryKey: ['biometric', 'punches'] }); },
  });

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>Employee ↔ Device ID mapping</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>
            Enter the <code>emp_code</code> from ZKBioTime for each employee. Find it under Personnel → Employees.
          </p>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ background: 'var(--color-bg-subtle)', textAlign: 'left' }}>
            {['Employee', 'Department', 'Device ID (emp_code)', ...(canManage ? [''] : [])].map((h) => (
              <th key={h} style={{ padding: '10px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</td></tr>
          ) : employees?.map((e) => {
            const draft = editing[e.id] ?? e.biometricUserId ?? '';
            const changed = draft !== (e.biometricUserId ?? '');
            return (
              <tr key={e.id} style={{ borderTop: '1px solid var(--color-border-default)' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ fontWeight: 500 }}>{e.fullName}</div>
                  {e.employeeIdCode && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{e.employeeIdCode}</div>}
                </td>
                <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>{e.department ?? '—'}</td>
                <td style={{ padding: '10px 16px' }}>
                  {canManage ? (
                    <input
                      className="form-input"
                      value={draft}
                      onChange={(ev) => setEditing((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                      placeholder="e.g. 10001"
                      style={{ width: 120, fontFamily: 'var(--font-mono)' }}
                    />
                  ) : (
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{e.biometricUserId ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</span>
                  )}
                </td>
                {canManage && (
                  <td style={{ padding: '10px 16px' }}>
                    {changed && (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={save.isPending}
                        onClick={() => { save.mutate({ id: e.id, val: draft }); setEditing((prev) => { const next = { ...prev }; delete next[e.id]; return next; }); }}
                      >
                        Save
                      </Button>
                    )}
                    {!changed && e.biometricUserId && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>
                        <CheckCircle2 size={12} /> Mapped
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Punches tab ─────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  PRESENT:  'var(--color-success)',
  ABSENT:   'var(--color-danger)',
  HALF_DAY: 'var(--color-warning)',
  LEAVE:    'var(--color-info, #3182CE)',
};

// ─── Period presets (mirrors ZKBioTime's Date Period dropdown) ──

type Preset =
  | 'today' | 'yesterday'
  | 'this-week' | 'this-month' | 'this-year'
  | 'last-week' | 'last-month'
  | 'last-3-months' | 'last-6-months' | 'last-year'
  | 'custom';

const PRESET_OPTIONS: { key: Preset; label: string }[] = [
  { key: 'today',         label: 'Today' },
  { key: 'yesterday',     label: 'Yesterday' },
  { key: 'this-week',     label: 'This week' },
  { key: 'this-month',    label: 'This month' },
  { key: 'this-year',     label: 'This year' },
  { key: 'last-week',     label: 'Last week' },
  { key: 'last-month',    label: 'Last month' },
  { key: 'last-3-months', label: 'Last three months' },
  { key: 'last-6-months', label: 'Last six months' },
  { key: 'last-year',     label: 'Last year' },
  { key: 'custom',        label: 'User Defined' },
];

function fmtDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Compute the [from, to] date-keys for the given preset. Weeks start Sunday. */
function rangeForPreset(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay(); // 0 = Sunday
  const todayKey = fmtDayKey(now);

  switch (preset) {
    case 'today':
      return { from: todayKey, to: todayKey };
    case 'yesterday': {
      const y2 = new Date(now.getTime() - 86_400_000);
      const k = fmtDayKey(y2);
      return { from: k, to: k };
    }
    case 'this-week': {
      const start = new Date(now.getTime() - dow * 86_400_000);
      return { from: fmtDayKey(start), to: todayKey };
    }
    case 'this-month':
      return { from: fmtDayKey(new Date(y, m, 1)), to: todayKey };
    case 'this-year':
      return { from: fmtDayKey(new Date(y, 0, 1)), to: todayKey };
    case 'last-week': {
      const thisStart = new Date(now.getTime() - dow * 86_400_000);
      const lastStart = new Date(thisStart.getTime() - 7 * 86_400_000);
      const lastEnd   = new Date(thisStart.getTime() - 86_400_000);
      return { from: fmtDayKey(lastStart), to: fmtDayKey(lastEnd) };
    }
    case 'last-month': {
      const start = new Date(y, m - 1, 1);
      const end   = new Date(y, m, 0); // day 0 of current month = last day of previous
      return { from: fmtDayKey(start), to: fmtDayKey(end) };
    }
    case 'last-3-months':
      return { from: fmtDayKey(new Date(y, m - 3, d)), to: todayKey };
    case 'last-6-months':
      return { from: fmtDayKey(new Date(y, m - 6, d)), to: todayKey };
    case 'last-year':
      return { from: fmtDayKey(new Date(y - 1, 0, 1)), to: fmtDayKey(new Date(y - 1, 11, 31)) };
    case 'custom':
      return { from: customFrom || todayKey, to: customTo || todayKey };
  }
}

function PunchesTab() {
  const qc = useQueryClient();
  const user = useCurrentUser();
  const canManage = user ? checkPermissionSync(user, 'biometric.manage') : false;
  const todayKey = localDayKey();

  const [preset, setPreset] = useState<Preset>('today');
  const [customFrom, setCustomFrom] = useState(todayKey);
  const [customTo, setCustomTo]     = useState(todayKey);
  const [manualOpen, setManualOpen] = useState(false);

  const { from, to } = rangeForPreset(preset, customFrom, customTo);
  const rangeValid = from <= to;

  const { data: sessions, isLoading, isFetching } = useSessions(
    rangeValid ? { from, to } : { date: todayKey },
  );

  const rebuild = useMutation({
    mutationFn: () =>
      api<{ rebuilt: number; employees: number; remapped: number }>('/api/biometric/rebuild', {
        method: 'POST',
        body: JSON.stringify({ from, to }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biometric', 'sessions'] });
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  const showDateCol = from !== to;
  const cols = showDateCol
    ? ['Date', 'Name', 'Employee ID', 'Department', 'Clock In', 'Clock Out', 'Total Work', 'Overtime']
    : ['Name', 'Employee ID', 'Department', 'Clock In', 'Clock Out', 'Total Work', 'Overtime'];

  const headerLabel = from === to
    ? fmtDate(`${from}T12:00:00`, 'EEEE · d MMM yyyy')
    : `${fmtDate(`${from}T12:00:00`, 'd MMM yyyy')} – ${fmtDate(`${to}T12:00:00`, 'd MMM yyyy')}`;

  const dateInputStyle: React.CSSProperties = {
    width: 150,
    opacity: preset === 'custom' ? 1 : 0.5,
    cursor: preset === 'custom' ? 'text' : 'not-allowed',
  };

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border-default)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>Daily attendance</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>
            {headerLabel}
            {isFetching && <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)' }}>· refreshing…</span>}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Period
          </label>
          <select
            className="form-input"
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
            style={{ width: 170 }}
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>

          <input
            type="date"
            className="form-input"
            value={customFrom}
            max={customTo || todayKey}
            disabled={preset !== 'custom'}
            onChange={(e) => setCustomFrom(e.target.value)}
            style={dateInputStyle}
            aria-label="From date"
          />
          <span style={{ color: 'var(--color-text-muted)' }}>–</span>
          <input
            type="date"
            className="form-input"
            value={customTo}
            min={customFrom}
            max={todayKey}
            disabled={preset !== 'custom'}
            onChange={(e) => setCustomTo(e.target.value)}
            style={dateInputStyle}
            aria-label="To date"
          />

          {canManage && (
            <>
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={<ClipboardEdit size={14} />}
                onClick={() => setManualOpen(true)}
                title="Record a missed clock-in / clock-out on someone's behalf. Overrides any biometric record for that day."
              >
                Manual entry
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={rebuild.isPending}
                onClick={() => rebuild.mutate()}
                title="Recompute attendance from stored biometric punches (safe — never overwrites manual records)"
              >
                Recompute
              </Button>
            </>
          )}
        </div>
      </div>

      {canManage && (
        <ManualPunchModal open={manualOpen} onClose={() => setManualOpen(false)} defaultDate={todayKey} />
      )}

      {rebuild.data && (
        <div style={{ padding: '8px 20px', background: 'var(--color-bg-subtle)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          Recomputed {rebuild.data.rebuilt} attendance record{rebuild.data.rebuilt === 1 ? '' : 's'} across {rebuild.data.employees} employee{rebuild.data.employees === 1 ? '' : 's'}.
          {rebuild.data.remapped > 0 && ` Also linked ${rebuild.data.remapped} previously-unmapped punch${rebuild.data.remapped === 1 ? '' : 'es'} to employees.`}
        </div>
      )}
      {rebuild.error && (
        <div style={{ padding: '8px 20px', background: 'var(--color-danger-light, #FEF2F2)', fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
          Recompute failed: {(rebuild.error as Error).message}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ background: 'var(--color-bg-subtle)', textAlign: 'left' }}>
            {cols.map((h) => (
              <th key={h} style={{ padding: '10px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</td></tr>
          ) : !sessions?.length ? (
            <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>No attendance records for this period.</td></tr>
          ) : sessions.map((s) => (
            <tr key={`${s.date}-${s.employeeId}`} style={{ borderTop: '1px solid var(--color-border-default)' }}>
              {showDateCol && (
                <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  {fmtDate(`${s.date}T12:00:00`, 'EEE, d MMM')}
                </td>
              )}
              <td style={{ padding: '10px 16px', fontWeight: 500 }}>{s.employeeName}</td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                {s.employeeIdCode ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
              </td>
              <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>
                {s.department ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
              </td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: s.clockInTime ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                {s.clockInTime ? fmtTime(s.clockInTime) : '—'}
              </td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: s.clockOutTime ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                {s.clockOutTime ? fmtTime(s.clockOutTime) : '—'}
              </td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontWeight: s.totalWorkedMinutes > 0 ? 500 : undefined, color: s.totalWorkedMinutes > 0 ? undefined : 'var(--color-text-muted)' }}>
                {s.totalWorkedMinutes > 0 ? fmtDuration(s.totalWorkedMinutes) : '—'}
              </td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: s.overtimeMinutes > 0 ? STATUS_COLOR.PRESENT : 'var(--color-text-muted)' }}>
                {s.overtimeMinutes > 0 ? fmtDuration(s.overtimeMinutes) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Simulator tab ───────────────────────────────────────

function SimulateTab() {
  const qc = useQueryClient();
  const { data: employees } = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [punchState, setPunchState] = useState<'0' | '1'>('0');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const simulate = useMutation({
    mutationFn: () => api<{ ok: boolean; applied: number; duplicates: number; unmapped: number }>('/api/biometric/simulate', {
      method: 'POST',
      body: JSON.stringify({ employeeId, punchState }),
    }),
    onSuccess: (r) => {
      setLastResult(JSON.stringify(r, null, 2));
      qc.invalidateQueries({ queryKey: ['biometric'] });
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (e) => setLastResult(`Error: ${e.message}`),
  });

  const mapped = employees?.filter((e) => e.biometricUserId) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 500 }}>
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 'var(--text-base)', fontWeight: 600 }}>Simulate a biometric punch</h3>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Writes through the same pipeline as real punches, marked as <code>MOCK</code>. Only works with mapped employees and an active device.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Employee</label>
          <select className="form-input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— Select employee —</option>
            {mapped.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName} (ID: {e.biometricUserId})</option>
            ))}
          </select>
          {employees && mapped.length === 0 && (
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-warning)' }}>
              No employees have a biometric ID mapped yet. Set them in the Mapping tab first.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Punch type</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {([['0', 'Clock In', 'var(--color-success)'], ['1', 'Clock Out', 'var(--color-danger)']] as const).map(([val, label, color]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                <input type="radio" name="punchState" value={val} checked={punchState === val} onChange={() => setPunchState(val)} />
                <span style={{ color }}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          leadingIcon={<Play size={16} />}
          onClick={() => simulate.mutate()}
          loading={simulate.isPending}
          disabled={!employeeId}
        >
          Simulate punch now
        </Button>

        {lastResult && (
          <pre style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 12, margin: 0, overflowX: 'auto' }}>
            {lastResult}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Sync log tab ─────────────────────────────────────────

function SyncLogTab() {
  const { data: logs, isLoading } = useSyncLog();

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-default)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>Sync log</h3>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>Last 50 ingest batches.</p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ background: 'var(--color-bg-subtle)', textAlign: 'left' }}>
            {['Time', 'Received', 'Applied', 'Duplicates', 'Unmapped', 'Status'].map((h) => (
              <th key={h} style={{ padding: '10px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</td></tr>
          ) : !logs?.length ? (
            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>No sync activity yet.</td></tr>
          ) : logs.map((l) => (
            <tr key={l.id} style={{ borderTop: '1px solid var(--color-border-default)' }}>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                {fmtDate(l.startedAt, 'EEE d MMM')} {fmtTime(l.startedAt)}
              </td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{l.received}</td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: l.applied > 0 ? 'var(--color-success)' : undefined }}>{l.applied}</td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{l.duplicates}</td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: l.unmapped > 0 ? 'var(--color-warning)' : undefined }}>{l.unmapped}</td>
              <td style={{ padding: '10px 16px' }}>
                {l.error ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>
                    <XCircle size={12} /> {l.error}
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-success)', fontSize: 'var(--text-xs)' }}>
                    <CheckCircle2 size={12} /> OK
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Manual punch modal (HR/Admin override) ─────────────

function ManualPunchModal({
  open,
  onClose,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
}) {
  const qc = useQueryClient();
  const { data: employees } = useEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset when reopened so a stale entry doesn't leak between sessions.
  const reset = () => {
    setEmployeeId(''); setDate(defaultDate);
    setClockIn(''); setClockOut(''); setReason(''); setError(null);
  };

  const save = useMutation({
    mutationFn: () =>
      api<{ ok: true }>('/api/biometric/manual-punch', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          date,
          clockIn: clockIn || undefined,
          clockOut: clockOut || undefined,
          reason,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biometric', 'sessions'] });
      qc.invalidateQueries({ queryKey: ['attendance'] });
      onClose();
      reset();
    },
    onError: (e: Error) => setError(e.message),
  });

  const canSubmit =
    !!employeeId && !!date && (!!clockIn || !!clockOut) && reason.trim().length >= 3 && !save.isPending;

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset(); }}
      title="Manual attendance entry"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!canSubmit}
            onClick={() => { setError(null); save.mutate(); }}
          >
            Save
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          Use this when someone forgot to tap or the device missed a punch. The
          record is saved with source <code>MANUAL</code> and will not be
          overwritten by later biometric recomputes.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="form-label">Employee</label>
          <select
            className="form-input"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">— Select employee —</option>
            {employees?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}{e.employeeIdCode ? ` (${e.employeeIdCode})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="form-label">Date</label>
          <input
            type="date"
            className="form-input"
            value={date}
            max={defaultDate}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="form-label">Clock in</label>
            <input
              type="time"
              className="form-input"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="form-label">Clock out</label>
            <input
              type="time"
              className="form-input"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
            />
          </div>
        </div>
        <p className="muted" style={{ margin: '-4px 0 0', fontSize: 'var(--text-xs)' }}>
          Leave one blank to only set the other side. Blank fields keep any
          existing value for that day.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="form-label">Reason</label>
          <input
            type="text"
            className="form-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Forgot to tap at entrance"
            maxLength={200}
          />
        </div>

        {error && (
          <div style={{ padding: 10, background: 'var(--color-danger-light, #FEF2F2)', color: 'var(--color-danger)', borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
