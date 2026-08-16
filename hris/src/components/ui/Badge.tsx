import type { ReactNode } from 'react';
import { cx } from '../../lib/utils';
import './Badge.css';

type Variant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'casual'
  | 'sick'
  | 'replacement'
  | 'holiday';

interface Props {
  children: ReactNode;
  variant?: Variant;
  soft?: boolean;
  className?: string;
  leadingIcon?: ReactNode;
}

export function Badge({ children, variant = 'default', soft = true, className, leadingIcon }: Props) {
  return (
    <span
      className={cx(
        'badge',
        `badge-${variant}`,
        soft ? 'badge-soft' : 'badge-solid',
        className
      )}
    >
      {leadingIcon && <span className="badge-icon">{leadingIcon}</span>}
      {children}
    </span>
  );
}
