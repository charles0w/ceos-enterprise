'use client';

import { useState, useEffect } from 'react';
import type { AgentWithStatus } from '@/lib/types';

const REFRESH_MS = 15_000;

function hasReport(status: AgentWithStatus['status']): boolean {
  return status != null && status.state != null;
}

function dotColor(status: AgentWithStatus['status']) {
  if (!hasReport(status)) return '#374151';
  if (status!.state === 'error') return '#ef4444';
  if (status!.state === 'warn') return '#eab308';
  return '#22c55e';
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Fleet({ initial }: { initial: AgentWithStatus[] }) {
  const [fleet, setFleet] = useState(initial);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch('/api/agents');
      if (res.ok) setFleet(await res.json());
      setTick((t) => t + 1);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const reporting = fleet.filter((f) => hasReport(f.status)).length;
  const healthy = fleet.filter((f) => f.status?.ok === true).length;

  return (
    <>
      {/* Summary bar */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          margin: '16px 0',
          padding: '12px 16px',
          background: '#0a0a0a',
          border: '1px solid #1f1f1f',
          borderRadius: 10,
          fontSize: 13,
        }}
      >
        <span style={{ color: '#888' }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>{fleet.length}</span> agents
        </span>
        <span style={{ color: '#888' }}>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{healthy}</span> healthy
        </span>
        <span style={{ color: '#888' }}>
          <span style={{ color: reporting === fleet.length ? '#22c55e' : '#eab308', fontWeight: 600 }}>
            {reporting}/{fleet.length}
          </span>{' '}
          reporting
        </span>
      </div>

      {/* Agent cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        {fleet.map(({ agent, status }) => (
          <div
            key={agent.id}
            style={{
              border: `1px solid ${hasReport(status) ? (status!.ok ? '#1a3a1a' : '#3a1a1a') : '#2a2a2a'}`,
              borderRadius: 12,
              padding: 16,
              background: '#111',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 15 }}>{agent.name}</strong>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: dotColor(status),
                    display: 'inline-block',
                    boxShadow: status?.ok ? '0 0 6px #22c55e66' : undefined,
                  }}
                />
                <span style={{ color: hasReport(status) ? (status!.ok ? '#22c55e' : '#ef4444') : '#555' }}>
                  {hasReport(status) ? status!.state : 'no report'}
                </span>
              </span>
            </div>

            {/* Role + repo */}
            <p style={{ color: '#aaa', fontSize: 13, margin: '8px 0 4px' }}>{agent.role}</p>
            <p style={{ color: '#555', fontSize: 11, margin: 0 }}>{agent.ownerRepo}</p>

            {/* Skills */}
            {agent.skills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                {agent.skills.map((s) => (
                  <span
                    key={s}
                    style={{
                      fontSize: 10,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: '#1a1a1a',
                      color: '#666',
                      border: '1px solid #2a2a2a',
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* Status */}
            {hasReport(status) ? (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid #1f1f1f',
                }}
              >
                <p style={{ fontSize: 12, color: '#ccc', margin: '0 0 4px' }}>{status!.summary}</p>
                <p style={{ color: '#444', fontSize: 11, margin: 0 }}>
                  {relativeTime(status!.lastRun)} · {agent.schedule}
                </p>
              </div>
            ) : (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1f1f1f' }}>
                <p style={{ color: '#444', fontSize: 11, margin: 0 }}>{agent.schedule}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <p style={{ color: '#333', fontSize: 11, marginTop: 12 }}>
        refreshed {tick === 0 ? 'on load' : `${tick}× · every ${REFRESH_MS / 1000}s`}
      </p>
    </>
  );
}
