'use client';

import { useState, useCallback } from 'react';

interface Business {
  place_id: string;
  name: string;
  category: string;
  rating: number;
  review_count: number;
  address: string;
  phone: string;
  demo_url: string | null;
  owner_email: string | null;
  outreach_status: string;
  notes: string | null;
}

type Outcome = 'interested' | 'voicemail' | 'not_interested' | 'skip';

const OUTCOME_BTNS: { key: Outcome; label: string; color: string; bg: string }[] = [
  { key: 'interested',     label: '🔥 Interested',    color: '#22c55e', bg: '#0f2a1a' },
  { key: 'voicemail',      label: '📞 Voicemail',     color: '#3b82f6', bg: '#0f1e30' },
  { key: 'not_interested', label: '✗ Not interested', color: '#ef4444', bg: '#2a0f0f' },
  { key: 'skip',           label: 'Skip →',           color: '#555',    bg: 'transparent' },
];

const PITCH_LINES: Record<string, string> = {
  salon:    'I built a free website preview for {name} — I can bring them more booking clients.',
  beauty:   'I built a free website for {name} — helps fill appointment slots.',
  cafe:     'I built a free website preview for {name} — helps people find them online.',
  food:     'I built a preview website for {name} — can drive more walk-in traffic.',
  retail:   'I built a free website preview for {name} — helps them show up in local search.',
  fitness:  'I built a free website for {name} — helps attract new members.',
  services: 'I built a free website preview for {name} — helps them get found online.',
};

function getPitch(biz: Business): string {
  const template = PITCH_LINES[biz.category] ?? PITCH_LINES.services;
  return template.replace('{name}', biz.name);
}

function categoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    salon: '✂️', beauty: '💅', cafe: '☕', food: '🍽️',
    retail: '🛍️', fitness: '💪', services: '🔧',
  };
  return map[cat] ?? '🏪';
}

export function CallQueue({ businesses }: { businesses: Business[] }) {
  const [queue, setQueue] = useState<Business[]>(() =>
    businesses.filter(b =>
      b.phone &&
      !['not_interested', 'closed', 'phone_interested'].includes(b.outreach_status ?? '')
    ).sort((a, b) => {
      // Prioritize: has demo > high rating
      const aScore = (a.demo_url ? 100 : 0) + (a.rating * 10);
      const bScore = (b.demo_url ? 100 : 0) + (b.rating * 10);
      return bScore - aScore;
    })
  );
  const [callIdx, setCallIdx] = useState(0);
  const [notes, setNotes] = useState('');
  const [logging, setLogging] = useState(false);
  const [done, setDone] = useState<{ name: string; outcome: string }[]>([]);

  const current = queue[callIdx];
  const remaining = queue.length - callIdx;

  const logOutcome = useCallback(async (outcome: Outcome) => {
    if (!current) return;
    setLogging(true);
    try {
      await fetch('/api/businesses/log-call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ place_id: current.place_id, outcome, notes: notes.trim() }),
      });
      setDone(d => [{ name: current.name, outcome }, ...d]);
    } catch { /* non-fatal */ }
    setNotes('');
    setLogging(false);
    setCallIdx(i => i + 1);
  }, [current, notes]);

  if (!queue.length) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ color: '#555', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
          No businesses with phone numbers in the queue.
        </p>
      </div>
    );
  }

  if (callIdx >= queue.length) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ color: '#22c55e', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Queue complete</p>
        <p style={{ color: '#555', fontSize: 13 }}>{done.length} calls logged this session</p>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360, margin: '24px auto 0' }}>
          {done.slice(0, 8).map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
              <span>{d.name}</span>
              <span style={{ color: d.outcome === 'interested' ? '#22c55e' : d.outcome === 'voicemail' ? '#3b82f6' : '#555' }}>
                {d.outcome}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

      {/* ── Main call card ── */}
      <div>
        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: '#555' }}>
            {callIdx + 1} / {queue.length} · {remaining - 1} remaining
          </span>
          <div style={{ flex: 1, height: 3, background: '#111', borderRadius: 99 }}>
            <div style={{
              height: '100%', borderRadius: 99, background: '#3b82f6',
              width: `${((callIdx) / queue.length) * 100}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Business card */}
        <div style={{
          background: '#0a0f15', border: '1px solid #15212c',
          borderRadius: 14, padding: '28px 28px 24px', marginBottom: 16,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22 }}>{categoryEmoji(current.category)}</span>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#eef6f9' }}>{current.name}</h2>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#555' }}>
                {current.address?.split(',').slice(0, 2).join(',')} · {current.category}
                {current.rating ? ` · ${current.rating}★ (${current.review_count})` : ''}
              </p>
            </div>
            {current.demo_url && (
              <a href={current.demo_url} target="_blank" rel="noreferrer" style={{
                fontSize: 11, color: '#3b82f6', textDecoration: 'none',
                padding: '4px 10px', border: '1px solid #1e3a5f', borderRadius: 6,
                background: '#0f1e30', flexShrink: 0,
              }}>
                demo →
              </a>
            )}
          </div>

          {/* Phone number — big and tappable */}
          <a href={`tel:${current.phone}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 14, background: '#0f2a1a', border: '1px solid #22c55e44',
            borderRadius: 12, padding: '20px 24px', textDecoration: 'none',
            marginBottom: 20, transition: 'background 0.15s',
          }}>
            <span style={{ fontSize: 28 }}>📞</span>
            <span style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 26,
              fontWeight: 600, color: '#22c55e', letterSpacing: '0.04em',
            }}>
              {current.phone}
            </span>
          </a>

          {/* Pitch script */}
          <div style={{
            background: '#0c131b', border: '1px dashed #1c2b39',
            borderRadius: 8, padding: '12px 16px', marginBottom: 20,
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 10, color: '#4a5663', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
              Pitch
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#7c8a98', lineHeight: 1.6 }}>
              "Hi, is this {current.name}? I'm Charles, a UC Berkeley student.{' '}
              {getPitch(current)}{' '}
              {current.demo_url
                ? `I built a free preview at ${current.demo_url} — do you have 10 minutes to take a look?`
                : 'Can I send you a free preview of what it would look like?'}
              "
            </p>
          </div>

          {/* Notes */}
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional — e.g. 'call back Thursday', 'wants email')"
            style={{
              width: '100%', padding: '10px 12px',
              background: '#06080b', border: '1px solid #15212c',
              borderRadius: 8, color: '#c8d4de', fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              resize: 'vertical', minHeight: 60, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Outcome buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          {OUTCOME_BTNS.map(btn => (
            <button
              key={btn.key}
              onClick={() => logOutcome(btn.key)}
              disabled={logging}
              style={{
                padding: '12px 8px', borderRadius: 8, border: `1px solid ${btn.color}33`,
                background: btn.bg, color: btn.color,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                opacity: logging ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sidebar: upcoming ── */}
      <div>
        <p style={{
          fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
          color: '#4a5663', textTransform: 'uppercase', letterSpacing: '0.15em',
          marginBottom: 12,
        }}>
          Up next
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {queue.slice(callIdx + 1, callIdx + 8).map((biz, i) => (
            <div key={biz.place_id} style={{
              padding: '10px 12px', background: '#0a0f15',
              border: '1px solid #15212c', borderRadius: 8,
              opacity: Math.max(0.4, 1 - i * 0.08),
            }}>
              <div style={{ fontSize: 12, color: '#7c8a98', fontWeight: 500 }}>{biz.name}</div>
              <div style={{ fontSize: 11, color: '#4a5663', marginTop: 2 }}>
                {categoryEmoji(biz.category)} {biz.category}
                {biz.rating ? ` · ${biz.rating}★` : ''}
                {biz.demo_url ? ' · demo ✓' : ''}
              </div>
            </div>
          ))}
        </div>

        {/* Session log */}
        {done.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
              color: '#4a5663', textTransform: 'uppercase', letterSpacing: '0.15em',
              marginBottom: 10,
            }}>
              Called this session
            </p>
            {done.slice(0, 10).map((d, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '5px 0', borderBottom: '1px solid #0f1822',
                fontSize: 11,
              }}>
                <span style={{ color: '#555' }}>{d.name.slice(0, 22)}</span>
                <span style={{
                  color: d.outcome === 'interested' ? '#22c55e'
                    : d.outcome === 'voicemail' ? '#3b82f6' : '#555',
                }}>
                  {d.outcome === 'interested' ? '🔥' : d.outcome === 'voicemail' ? '📞' : '✗'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
