'use client';
import { useState } from 'react';
import { Plus, Send, Trash2, Pencil, CalendarCheck2 } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  useHolidays,
  useCreateHoliday,
  useUpdateHoliday,
  useDeleteHoliday,
  useSendHolidayNotice,
  type HolidayItem,
} from '@/lib/hooks';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Field, TextInput, TextArea } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { fmtDate, fmtRelative } from '../../lib/utils';
import './HolidayManager.css';

function DEFAULT_EMAIL_PREVIEW(name: string, date: string) {
  return `Dear Team,

We would like to inform you that ${fmtDate(date)} is a public holiday in observance of ${name}.

The office will remain closed on this day. Please plan your work accordingly.

We wish you a wonderful ${name}! 🎉

Warm regards,
Trace HRIS`;
}

type Recipients = 'ALL' | 'HR_ONLY' | 'STAFF_ONLY' | 'CUSTOM';

export function HolidayManager() {
  const { data: holidays = [], isLoading } = useHolidays();
  const create = useCreateHoliday();
  const update = useUpdateHoliday();
  const del = useDeleteHoliday();
  const send = useSendHolidayNotice();

  const [editing, setEditing] = useState<HolidayItem | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [recurring, setRecurring] = useState(true);
  const [recipients, setRecipients] = useState<Recipients>('ALL');
  const [error, setError] = useState<string | null>(null);

  function openEdit(h: HolidayItem | 'new') {
    setError(null);
    if (h === 'new') {
      setName('');
      setDate('');
      setDescription('');
      setRecurring(true);
      setRecipients('ALL');
    } else {
      setName(h.name);
      setDate(h.date);
      setDescription(h.description ?? '');
      setRecurring(h.isRecurring);
      setRecipients(h.recipients);
    }
    setEditing(h);
  }

  function save() {
    setError(null);
    const payload = { name, date, description: description || undefined, isRecurring: recurring, recipients };
    if (editing === 'new') {
      create.mutate(payload, {
        onSuccess: () => setEditing(null),
        onError: (e: Error) => setError(e.message),
      });
    } else if (editing) {
      update.mutate(
        { id: editing.id, patch: payload },
        {
          onSuccess: () => setEditing(null),
          onError: (e: Error) => setError(e.message),
        }
      );
    }
  }

  return (
    <div className="hmgr">
      <div className="hmgr-head">
        <div>
          <h1>Holiday manager</h1>
          <p className="muted">Plan holidays and send notices before they arrive.</p>
        </div>
        <Button variant="primary" leadingIcon={<Plus size={16} />} onClick={() => openEdit('new')}>
          New holiday
        </Button>
      </div>

      {isLoading && <div className="muted">Loading holidays…</div>}

      {!isLoading && holidays.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <CalendarCheck2 size={32} style={{ marginBottom: 12 }} />
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>No holidays yet</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>Click <em>New holiday</em> to add the company&apos;s first holiday.</div>
        </div>
      )}

      <div className="hmgr-list">
        {holidays.map((h) => {
          const isPast = new Date(h.date) < new Date();
          return (
            <motion.div
              key={h.id}
              className="hmgr-card card"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              layout
            >
              <div className="hmgr-card-date">
                <div className="hmgr-card-day">{new Date(h.date).getUTCDate()}</div>
                <div className="hmgr-card-month">{new Date(h.date).toLocaleString('en', { month: 'short', timeZone: 'UTC' })}</div>
                <div className="hmgr-card-year">{new Date(h.date).getUTCFullYear()}</div>
              </div>
              <div className="hmgr-card-body">
                <div className="hmgr-card-title">
                  <h4>{h.name}</h4>
                  {h.isRecurring && <Badge variant="info">Recurring</Badge>}
                  {isPast && <Badge>Past</Badge>}
                </div>
                {h.description && <p className="hmgr-card-desc">{h.description}</p>}
                <div className="hmgr-card-meta">
                  {h.notificationSentAt ? (
                    <span className="hmgr-card-sent">
                      <CalendarCheck2 size={12} /> Notice sent {fmtRelative(h.notificationSentAt)}
                    </span>
                  ) : (
                    <span className="muted">Notice pending</span>
                  )}
                  {' · '}
                  <span className="muted">
                    Recipients: {h.recipients.toLowerCase().replace('_', ' ')}
                  </span>
                </div>
              </div>
              <div className="hmgr-card-actions">
                {!isPast && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={<Send size={12} />}
                    onClick={() => setConfirmSend(h.id)}
                  >
                    {h.notificationSentAt ? 'Resend' : 'Send notice'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" leadingIcon={<Pencil size={12} />} onClick={() => openEdit(h)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" leadingIcon={<Trash2 size={12} />} onClick={() => setConfirmDelete(h.id)}>
                  Delete
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New holiday' : 'Edit holiday'}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={create.isPending || update.isPending}
              onClick={save}
              disabled={!name || !date}
            >
              Save
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Holiday name" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eid ul-Fitr" />
          </Field>
          <Field label="Date" required>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Description (optional)">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
          <Field label="Recipients">
            <select
              className="input"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value as Recipients)}
            >
              <option value="ALL">All employees</option>
              <option value="HR_ONLY">HR team only</option>
              <option value="STAFF_ONLY">Staff only (excluding HR)</option>
            </select>
          </Field>
          <label className="hmgr-check">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            Recurring holiday (indicative — actual repeat requires re-adding for the next year)
          </label>
          {error && (
            <div style={{ padding: 10, background: 'var(--color-danger-light)', color: 'var(--color-danger)', borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this holiday?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={del.isPending}
              onClick={() => {
                if (confirmDelete) {
                  del.mutate(confirmDelete, {
                    onSuccess: () => setConfirmDelete(null),
                  });
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>The holiday will be removed. Any recurring copies for future years will need to be re-added.</p>
      </Modal>

      <Modal
        open={!!confirmSend}
        onClose={() => setConfirmSend(null)}
        title="Send holiday notice?"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSend(null)}>Cancel</Button>
            <Button
              variant="primary"
              leadingIcon={<Send size={14} />}
              loading={send.isPending}
              onClick={() => {
                if (!confirmSend) return;
                send.mutate(confirmSend, {
                  onSuccess: () => setConfirmSend(null),
                });
              }}
            >
              Send now
            </Button>
          </>
        }
      >
        {(() => {
          const h = holidays.find((x) => x.id === confirmSend);
          if (!h) return null;
          return (
            <>
              <p style={{ marginBottom: 12 }}>
                Every recipient in <strong>{h.recipients.toLowerCase().replace('_', ' ')}</strong> will
                receive this notice by email and in-app.
              </p>
              <pre className="hmgr-preview">{DEFAULT_EMAIL_PREVIEW(h.name, h.date)}</pre>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
