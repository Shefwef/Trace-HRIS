'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Coffee } from 'lucide-react';
import { useGrantReplacementLeave } from '@/lib/hooks';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, TextArea, TextInput } from '../ui/Field';
import { cx } from '../../lib/utils';
import './GrantReplacementLeaveModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  employee: { id: string; fullName: string } | null;
}

type Slot = 'MORNING' | 'AFTERNOON';

export function GrantReplacementLeaveModal({ open, onClose, employee }: Props) {
  const grant = useGrantReplacementLeave();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDaySlot, setHalfDaySlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [linkOvertime, setLinkOvertime] = useState(false);
  const [overtimeWorkDate, setOvertimeWorkDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setStartDate('');
    setEndDate('');
    setIsHalfDay(false);
    setHalfDaySlot(null);
    setReason('');
    setDescription('');
    setLinkOvertime(false);
    setOvertimeWorkDate('');
    setError(null);
    setDone(false);
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }

  function handleSubmit() {
    if (!employee) return;
    if (!startDate) { setError('Pick a start date'); return; }
    if (!endDate) { setError('Pick an end date'); return; }
    if (reason.trim().length < 4) { setError('Reason must be at least 4 characters'); return; }
    if (isHalfDay && startDate !== endDate) { setError('Half-day grant must be a single day'); return; }
    if (isHalfDay && !halfDaySlot) { setError('Pick morning or afternoon for a half-day grant'); return; }

    setError(null);
    grant.mutate(
      {
        employeeId: employee.id,
        startDate,
        endDate: isHalfDay ? startDate : endDate,
        isHalfDay,
        halfDaySlot: isHalfDay ? (halfDaySlot ?? undefined) : undefined,
        reason: reason.trim(),
        description: description.trim() || undefined,
        overtimeWorkDate: linkOvertime && overtimeWorkDate ? overtimeWorkDate : undefined,
      },
      {
        onSuccess: () => setDone(true),
        onError: (e: Error) => setError(e.message),
      },
    );
  }

  const title = employee
    ? done
      ? 'Replacement leave granted'
      : `Grant replacement leave to ${employee.fullName}`
    : 'Grant replacement leave';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="lg"
      footer={
        done ? (
          <Button variant="primary" onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={grant.isPending}
              onClick={handleSubmit}
              disabled={!employee || !startDate || !endDate || reason.trim().length < 4}
              leadingIcon={<Coffee size={16} />}
            >
              Grant leave
            </Button>
          </>
        )
      }
    >
      {done ? (
        <motion.div
          className="grl-success"
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
          <h3>Leave granted</h3>
          <p>
            The replacement leave is now approved on {employee?.fullName}&apos;s record. They&apos;ve
            been notified and it will show up on their leave history and the calendar.
          </p>
        </motion.div>
      ) : (
        <div className="grl">
          <p className="grl-hint">
            This creates a pre-approved replacement leave on the employee&apos;s record.
            You can optionally link it to the overtime day it compensates for.
          </p>

          <div className="grl-row">
            <Field label="Start date" required>
              <TextInput
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (isHalfDay) setEndDate(e.target.value);
                  else if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </Field>
            <Field label="End date" required>
              <TextInput
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isHalfDay}
              />
            </Field>
          </div>

          <label className="grl-check">
            <input
              type="checkbox"
              checked={isHalfDay}
              onChange={(e) => {
                setIsHalfDay(e.target.checked);
                if (e.target.checked) {
                  setEndDate(startDate);
                  setHalfDaySlot('MORNING');
                } else {
                  setHalfDaySlot(null);
                }
              }}
            />
            <span>Half day only</span>
          </label>

          {isHalfDay && (
            <div className="grl-slots">
              <button
                type="button"
                className={cx('grl-slot', halfDaySlot === 'MORNING' && 'grl-slot-active')}
                onClick={() => setHalfDaySlot('MORNING')}
              >
                <span className="grl-slot-label">Morning</span>
                <span className="grl-slot-window">9:00 AM – 1:00 PM</span>
              </button>
              <button
                type="button"
                className={cx('grl-slot', halfDaySlot === 'AFTERNOON' && 'grl-slot-active')}
                onClick={() => setHalfDaySlot('AFTERNOON')}
              >
                <span className="grl-slot-label">Afternoon</span>
                <span className="grl-slot-window">1:00 PM – 5:00 PM</span>
              </button>
            </div>
          )}

          <Field label="Reason" required hint="Short summary shown on the leave record.">
            <TextInput
              maxLength={100}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Replacement leave for weekend on-call coverage"
            />
          </Field>

          <Field label="Description (optional)">
            <TextArea
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any additional context for the employee or audit trail"
              rows={3}
            />
          </Field>

          <label className="grl-check">
            <input
              type="checkbox"
              checked={linkOvertime}
              onChange={(e) => setLinkOvertime(e.target.checked)}
            />
            <span>Link to a specific overtime / extra work date</span>
          </label>

          {linkOvertime && (
            <Field label="Overtime work date">
              <TextInput
                type="date"
                value={overtimeWorkDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setOvertimeWorkDate(e.target.value)}
              />
            </Field>
          )}

          {error && <div className="grl-error">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
