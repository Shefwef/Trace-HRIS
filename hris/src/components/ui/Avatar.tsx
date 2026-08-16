import { cx } from '../../lib/utils';
import './Avatar.css';

interface Props {
  initials: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ initials, color, size = 'md', className }: Props) {
  return (
    <span
      className={cx('avatar', `avatar-${size}`, className)}
      style={{ background: color }}
    >
      {initials}
    </span>
  );
}
