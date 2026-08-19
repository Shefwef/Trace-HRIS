'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useSubmitExtraWork } from '@/lib/hooks';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, TextArea, TextInput } from '../ui/Field';
import { cx } from '../../lib/utils';
import './LogExtraWorkModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

type WorkType = 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON';

const OPTIONS: {
  key: WorkType; label: string; window: string; credit: string; color: string; bg: string;
}[] = [
  {
    key: 'FULL_DAY',
    label: 'Full day',
    window: '9:00 AM – 5:00 PM',
    credit: '+1 day',
    color: 'var(--color-success)',
    bg: 'var(--color-success-light)',
  },
  {
    key: 'HALF_DAY_MORNING',
    label: 'Half day (morning)',
    window: '9:00 AM – 1:00 PM',
    credit: '+0.5 day',
    color: 'var(--color-leave-replacement)',
    bg: 'var(--color-leave-replacement-light)',
  },
  {
    key: 'HALF_DAY_AFTERNOON',
    label: 'Half day (afternoon)',
    window: '1:00 PM – 5:00 PM',
    credit: '+0.5 day',
    color: 'var(--color-leave-replacement)',
    bg: 'var(--color-leave-replacement-light)',
  },
];

export function LogExtraWorkModal({ open, onClose }: Props) {
  const submit = useSubmitExtraWork();
  const [workDate, setWorkDate] = useState('');
  const [workType, setWorkType] = useState<WorkType | null>(null);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setWorkDate('');
    setWorkType(null);
    setReason('');
    setDescription('');
    setDone(false);
    setError(null);
  }
  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }
  function handleSubmit() {
    if (!workDate || !workType || reason.trim().length < 2) return;
    setError(null);
    submit.mutate(
      { workDate, workType, reason: reason.trim(), description: description || undefined },
      {
        onSuccess: () => setDone(true),
        onError: (e: Error) => setError(e.message),
      }
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={done ? 'Extra work logged' : 'Log an extra work day'}
      size="lg"
      footer={
        done ? (
          <Button variant="primary" onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={submit.isPending}
              disabled={!workDate || !workType || reason.trim().length < 2}
              onClick={handleSubmit}
            >
              Send for approval
            </Button>
          </>
        )
      }
    >
      {done ? (
        <motion.div
          className="lew-success"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <svg viewBox="0 0 64 64" width="72" height="72">
            <circle cx="32" cy="32" r="30" fill="var(--color-success-light)" />
            <motion.path
              d="M20 33 L29 42 L45 24"
              fill="none"
              stroke="var(--color-success)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            />
          </svg>
          <h3>Sent for approval</h3>
          <p>
            HR (or an Admin) will review this log. Once approved, your replacement leave balance
            will update automatically.
          </p>
        </motion.div>
      ) : (
        <div className="lew">
          <p className="lew-hint">
            You always work <strong>9 AM – 5 PM</strong>. Pick which slot you covered on the
            weekend or holiday you&apos;re logging.
          </p>

          <Field label="Date you worked" required>
            <TextInput
              type="date"
              value={workDate}
              max={today}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </Field>

          <div className="lew-options">
            {OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={cx('lew-option', workType === o.key && 'lew-option-active')}
                onClick={() => setWorkType(o.key)}
                style={{ '--o-color': o.color, '--o-bg': o.bg } as React.CSSProperties}
              >
                <div className="lew-option-head">
                  <span className="lew-option-label">{o.label}</span>
                  <span className="lew-option-credit">{o.credit}</span>
                </div>
                <span className="lew-option-window">{o.window}</span>
                {workType === o.key && <span className="lew-option-check"><Check size={14} /></span>}
              </button>
            ))}
          </div>

          <Field label="Reason" required hint="Why did you come in?">
            <TextInput
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Client demo on Saturday"
            />
          </Field>

          <Field label="Description (optional)">
            <TextArea
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any extra context for HR"
              rows={3}
            />
          </Field>

          {error && <div className="lew-error">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
