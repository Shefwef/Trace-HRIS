import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/utils';
import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  leadingIcon,
  trailingIcon,
  fullWidth,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={cx(
        'btn',
        `btn-${variant}`,
        `btn-${size}`,
        fullWidth && 'btn-full',
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="btn-spinner" aria-hidden />}
      {!loading && leadingIcon && <span className="btn-icon">{leadingIcon}</span>}
      <span>{children}</span>
      {!loading && trailingIcon && <span className="btn-icon">{trailingIcon}</span>}
    </button>
  );
}
