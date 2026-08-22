import { useState } from 'react';
import { cx } from '../../lib/utils';
import './Avatar.css';

interface Props {
  initials: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Optional profile image URL. Falls back to initials on load error. */
  imageUrl?: string | null;
  /** Optional alt text for the profile image. */
  alt?: string;
}

/**
 * Round avatar tile. Renders `imageUrl` when provided (falling back to
 * initials-on-a-color if the image fails to load), otherwise shows just
 * the initials on a hashed color. Keeps the same visual footprint in
 * both modes so layout doesn't shift.
 */
export function Avatar({ initials, color, size = 'md', className, imageUrl, alt }: Props) {
  const [broken, setBroken] = useState(false);
  const hasImage = !!imageUrl && !broken;

  return (
    <span
      className={cx('avatar', `avatar-${size}`, className)}
      style={{ background: hasImage ? 'var(--color-bg-subtle)' : color }}
    >
      {hasImage ? (
        <img
          src={imageUrl!}
          alt={alt ?? initials}
          onError={() => setBroken(true)}
          className="avatar-img"
          draggable={false}
        />
      ) : (
        initials
      )}
    </span>
  );
}
