import type { ReactNode } from 'react';
import { cx } from '../../lib/utils';
import './StatCard.css';

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
  className?: string;
}

export function StatCard({ label, value, hint, icon, accent = 'muted', className }: Props) {
  return (
    <div className={cx('statcard', `statcard-${accent}`, className)}>
      <div className="statcard-header">
        <span className="statcard-label">{label}</span>
        {icon && <span className="statcard-icon">{icon}</span>}
      </div>
      <div className="statcard-value">{value}</div>
      {hint && <div className="statcard-hint">{hint}</div>}
    </div>
  );
}
