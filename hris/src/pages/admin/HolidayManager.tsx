import { useMemo, useState } from 'react';
import { Plus, Send, Trash2, Pencil, CalendarCheck2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '../../lib/store';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Field, TextInput, TextArea } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { fmtDate, fmtRelative } from '../../lib/utils';
import type { Holiday } from '../../lib/types';
import './HolidayManager.css';

function DEFAULT_EMAIL(name: string, date: string) {
  return `Dear Team,

We would like to inform you that ${fmtDate(date)} is a public holiday in observance of ${name}.

The office will remain closed on this day. Please plan your work accordingly.

We wish you a wonderful ${name}!

Warm regards,
The HRIS People Team`;
}

export function HolidayManager() {
  const allHolidays = useStore((s) => s.holidays);
  const holidays = useMemo(
    () => allHolidays.slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
    [allHolidays]
  );
  const create = useStore((s) => s.createHoliday);
  const update = useStore((s) => s.updateHoliday);
  const del = useStore((s) => s.deleteHoliday);
  const send = useStore((s) => s.sendHolidayNotice);

  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [recurring, setRecurring] = useState(true);
  const [recipients, setRecipients] = useState<Holiday['recipients']>('ALL');

  function openEdit(h: Holiday | 'new') {
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
    if (editing === 'new') {
      create({
        name,
        date,
        description,
        isRecurring: recurring,
        notificationScheduled: true,
        recipients,
      });
    } else if (editing) {
      update(editing.id, { name, date, description, isRecurring: recurring, recipients });
    }
    setEditing(null);
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
                <div className="hmgr-card-day">{new Date(h.date).getDate()}</div>
                <div className="hmgr-card-month">{new Date(h.date).toLocaleString('en', { month: 'short' })}</div>
                <div className="hmgr-card-year">{new Date(h.date).getFullYear()}</div>
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
                {!h.notificationSentAt && !isPast && (
                  <Button size="sm" variant="secondary" leadingIcon={<Send size={12} />} onClick={() => setConfirmSend(h.id)}>
                    Send notice
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
            <Button variant="primary" onClick={save} disabled={!name || !date}>Save</Button>
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
              onChange={(e) => setRecipients(e.target.value as Holiday['recipients'])}
            >
              <option value="ALL">All employees</option>
              <option value="HR_ONLY">HR team only</option>
              <option value="STAFF_ONLY">Staff only (excluding HR)</option>
              <option value="CUSTOM">Custom selection</option>
            </select>
          </Field>
          <label className="hmgr-check">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            Add automatically to next year
          </label>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this holiday?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (confirmDelete) del(confirmDelete); setConfirmDelete(null); }}>
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
              onClick={() => { if (confirmSend) send(confirmSend); setConfirmSend(null); }}
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
                The following notice will be delivered by email and in-app to all recipients:
              </p>
              <pre className="hmgr-preview">{DEFAULT_EMAIL(h.name, h.date)}</pre>
            </>
          );
        })()}
      </Modal>

    </div>
  );
}
