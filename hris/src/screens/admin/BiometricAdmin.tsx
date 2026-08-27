'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, Server, Users, AlertCircle, Activity, Play, Plus, CheckCircle2, XCircle, Wifi, WifiOff } from 'lucide-react';
import { api } from '@/lib/hooks';
import { fmtDate, fmtTime } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
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
interface PunchRow {
  id: string; deviceSerial: string; deviceAlias: string;
  deviceUserId: string; punchedAt: string; punchState: string;
  verifyType: number | null; employeeId: string | null; appliedAt: string | null;
}
interface SyncLogRow {
  id: string; deviceId: string | null; startedAt: string;
  received: number; applied: number; duplicates: number; unmapped: number; error: string | null;
}

// ─── Hooks ───────────────────────────────────────────────

function useDevices() {
  return useQuery({ queryKey: ['biometric', 'devices'], queryFn: () => api<DeviceRow[]>('/api/biometric/devices') });
}
function useEmployees() {
  return useQuery({ queryKey: ['biometric', 'employees'], queryFn: () => api<EmployeeRow[]>('/api/biometric/employees') });
}
function usePunches(deviceId?: string) {
  const qs = deviceId ? `?deviceId=${deviceId}` : '';
  return useQuery({ queryKey: ['biometric', 'punches', deviceId ?? 'all'], queryFn: () => api<PunchRow[]>(`/api/biometric/punches${qs}`) });
}
function useSyncLog() {
  return useQuery({ queryKey: ['biometric', 'sync-log'], queryFn: () => api<SyncLogRow[]>('/api/biometric/sync-log') });
}

// ─── Main screen ─────────────────────────────────────────

export function BiometricAdmin() {
  const [tab, setTab] = useState<'devices' | 'mapping' | 'punches' | 'simulate' | 'log'>('devices');
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
          { key: 'devices',  label: 'Devices',  icon: <Server size={14} /> },
          { key: 'mapping',  label: 'Mapping',   icon: <Users size={14} /> },
          { key: 'punches',  label: 'Punches',   icon: <Activity size={14} /> },
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

const STATE_LABEL: Record<string, string> = { '0': 'Clock In', '1': 'Clock Out' };
const VERIFY_LABEL: Record<number, string> = { 1: 'Fingerprint', 2: 'PIN', 3: 'Card', 15: 'Face', 99: 'Simulated' };

function PunchesTab() {
  const { data: punches, isLoading } = usePunches();

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-default)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>Recent punches</h3>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>Last 100 punches across all devices. Unmapped ones have no employee name.</p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ background: 'var(--color-bg-subtle)', textAlign: 'left' }}>
            {['Time', 'Device', 'Device user ID', 'Type', 'Method', 'Status'].map((h) => (
              <th key={h} style={{ padding: '10px 16px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</td></tr>
          ) : !punches?.length ? (
            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>No punches received yet.</td></tr>
          ) : punches.map((p) => (
            <tr key={p.id} style={{ borderTop: '1px solid var(--color-border-default)' }}>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                {fmtDate(p.punchedAt, 'EEE d MMM')} {fmtTime(p.punchedAt)}
              </td>
              <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>{p.deviceAlias}</td>
              <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>{p.deviceUserId}</td>
              <td style={{ padding: '10px 16px' }}>
                <span style={{ color: p.punchState === '0' ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 500 }}>
                  {STATE_LABEL[p.punchState] ?? p.punchState}
                </span>
              </td>
              <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>
                {p.verifyType != null ? (VERIFY_LABEL[p.verifyType] ?? `Type ${p.verifyType}`) : '—'}
              </td>
              <td style={{ padding: '10px 16px' }}>
                {p.employeeId ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-success)', fontSize: 'var(--text-xs)' }}>
                    <CheckCircle2 size={12} /> Applied
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-warning)', fontSize: 'var(--text-xs)' }}>
                    <AlertCircle size={12} /> Unmapped
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
