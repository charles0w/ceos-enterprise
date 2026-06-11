'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChromeIcon } from '@/components/chrome';

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
      justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 360, padding: '0 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      }}>
        {/* wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <ChromeIcon src="/assets/crown.png" size={28} radius={7} />
          <span className="label" style={{ fontSize: 11, letterSpacing: '0.3em', color: 'var(--txt-mid)' }}>
            CEO&nbsp;OS
          </span>
        </div>

        <form onSubmit={submit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Access key"
            autoFocus
            className="field mono"
            style={{
              width: '100%', padding: '12px 14px', fontSize: 14, textAlign: 'center',
              borderColor: error ? 'rgba(242,92,92,0.45)' : undefined,
            }}
          />
          {error && (
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--err)', textAlign: 'center' }}>
              incorrect access key
            </span>
          )}
          <button
            type="submit"
            disabled={loading || !pw}
            className="btn-chrome"
            style={{ padding: '12px 0' }}
          >
            {loading ? 'Verifying…' : 'Enter the fleet'}
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
