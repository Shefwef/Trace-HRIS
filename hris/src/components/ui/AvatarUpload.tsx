'use client';
import { useRef, useState } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { Avatar } from './Avatar';
import './AvatarUpload.css';

interface Props {
  value: string;
  name: string;
  onChange: (url: string) => void;
}

/** Circular avatar with file-picker upload, preview, and remove button. */
export function AvatarUpload({ value, name, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload/avatar', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}) as { url?: string; message?: string });
      if (!res.ok) throw new Error((json as { message?: string }).message ?? `Upload failed (${res.status})`);
      onChange((json as { url?: string }).url!);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="avup">
      <div className="avup-preview">
        <Avatar
          initials={initials}
          color="var(--color-brand-primary)"
          size="lg"
          imageUrl={value || null}
          alt={name}
        />
        {uploading && (
          <div className="avup-overlay">
            <Loader2 size={18} className="avup-spin" />
          </div>
        )}
      </div>

      <div className="avup-actions">
        <button
          type="button"
          className="avup-btn"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Camera size={13} />
          {value ? 'Change photo' : 'Upload photo'}
        </button>
        {value && (
          <button
            type="button"
            className="avup-btn avup-btn--remove"
            onClick={() => onChange('')}
            disabled={uploading}
          >
            <X size={13} />
            Remove
          </button>
        )}
        <span className="avup-hint">JPG, PNG or WebP · max 3 MB</span>
        {uploadError && <span className="avup-error">{uploadError}</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="avup-hidden-input"
        onChange={handleFile}
      />
    </div>
  );
}
