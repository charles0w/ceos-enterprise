'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function LoginForm() {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get('next') || '/';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pw, next }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(next);
    } else {
      setError(true);
      setPw('');
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)',
    }}>
      <div style={{
        width: '100%', maxWidth: 360, padding: '0 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      }}>
        {/* logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(47,212,230,0.4)',
            display: 'grid', placeItems: 'center', color: '#2fd4e6', fontSize: 14,
            boxShadow: '0 0 0 1px rgba(47,212,230,0.25), 0 0 22px -4px rgba(47,212,230,0.45)',
          }}>◉</span>
          <span style={{
            fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
            letterSpacing: '0.3em', textTransform: 'uppercase', color: '#7c8a98',
          }}>CEO OS</span>
        </div>

        <form onSubmit={submit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Access key"
            autoFocus
            style={{
              width: '100%', padding: '12px 14px',
              background: '#0a0f15', border: `1px solid ${error ? '#ef535066' : '#15212c'}`,
              borderRadius: 8, color: '#eef6f9', fontSize: 14,
              fontFamily: 'var(--font-mono, monospace)',
              outline: 'none',
            }}
          />
          {error && (
            <span style={{ fontSize: 12, color: '#ef5350', textAlign: 'center' }}>
              Incorrect access key
            </span>
          )}
          <button
            type="submit"
            disabled={loading || !pw}
            style={{
              padding: '11px', borderRadius: 8, border: 'none',
              background: loading || !pw ? '#15212c' : '#2fd4e6',
              color: loading || !pw ? '#4a5663' : '#06080b',
              fontSize: 13, fontWeight: 600, cursor: loading || !pw ? 'default' : 'pointer',
              transition: 'background 0.15s',
              fontFamily: 'var(--font-sans, sans-serif)',
            }}
          >
            {loading ? 'Verifying…' : 'Enter fleet'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
