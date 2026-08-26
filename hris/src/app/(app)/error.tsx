'use client';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App error]', error);
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '16px',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      <AlertTriangle size={40} color="var(--color-danger, #dc2626)" />
      <div>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.125rem', fontWeight: 600 }}>
          Something went wrong
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-secondary, #64748b)', fontSize: '0.875rem' }}>
          The page failed to load. This is usually a temporary database connection issue — try refreshing.
        </p>
      </div>
      <button
        onClick={reset}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 16px',
          borderRadius: '6px',
          border: '1px solid var(--color-border-default, #e2e8f0)',
          background: 'var(--color-bg-surface, #fff)',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  );
}
