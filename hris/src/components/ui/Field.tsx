import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/utils';
import './Field.css';

interface WrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: WrapperProps) {
  return (
    <label className={cx('field', error && 'field-error', className)}>
      {label && (
        <span className="field-label">
          {label} {required && <span className="field-required">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="field-msg field-msg-error">{error}</span>
      ) : hint ? (
        <span className="field-msg">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx('input textarea', props.className)} />;
}
