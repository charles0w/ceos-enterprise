'use client';

import { useState, useEffect } from 'react';
import type { AgentWithStatus } from '@/lib/types';

const REFRESH_MS = 15_000;

function statusDot(ok: boolean | undefined) {
  return ok ? '#22c55e' : '#374151';
}

export function Fleet({ initial }: { initial: AgentWithStatus[] }) {
  const [fleet, setFleet] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch('/api/agents');
      if (res.ok) setFleet(await res.json());
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          marginTop: 24,
        }}
      >
        {fleet.map(({ agent, status }) => (
          <div
            key={agent.id}
            style={{ border: '1px solid #2a2a2a', borderRadius: 12, padding: 16, background: '#111' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16 }}>{agent.name}</strong>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: statusDot(status?.ok),
                    display: 'inline-block',
                  }}
                />
                {status ? status.state : 'no report'}
              </span>
            </div>
            <p style={{ color: '#aaa', fontSize: 13, margin: '8px 0' }}>{agent.role}</p>
            <p style={{ color: '#666', fontSize: 12, margin: 0 }}>repo: {agent.ownerRepo}</p>
            <p style={{ color: '#666', fontSize: 12, margin: '2px 0 0' }}>schedule: {agent.schedule}</p>
            {status && (
              <>
                <p style={{ fontSize: 13, marginTop: 8 }}>{status.summary}</p>
                <p style={{ color: '#666', fontSize: 11, marginTop: 8 }}>
                  last run: {new Date(status.lastRun).toLocaleString()}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
      <p style={{ color: '#555', fontSize: 11, marginTop: 16 }}>
        Auto-refreshing every {REFRESH_MS / 1000}s
      </p>
    </>
  );
}
