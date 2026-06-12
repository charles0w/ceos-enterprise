'use client';

import { useState, useCallback } from 'react';
import { ProgressBar, StatusDot } from './chrome';

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

// hex mirrors of the globals.css tokens — literal so borders can carry an alpha suffix
const OUTCOME_BTNS: { key: Outcome; label: string; color: string; bg: string }[] = [
  { key: 'interested',     label: 'Interested',     color: '#3fe08f', bg: 'rgba(63,224,143,0.07)' },
  { key: 'voicemail',      label: 'Voicemail',      color: '#d7dae2', bg: 'rgba(215,218,226,0.05)' },
  { key: 'not_interested', label: 'Not interested', color: '#f25c5c', bg: 'rgba(242,92,92,0.06)' },
  { key: 'skip',           label: 'Skip →',         color: '#54565e', bg: 'transparent' },
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

function outcomeGlyph(outcome: string): { glyph: string; color: string } {
  if (outcome === 'interested') return { glyph: '●', color: 'var(--ok)' };
  if (outcome === 'voicemail')  return { glyph: '◌', color: 'var(--silver)' };
  return { glyph: '✗', color: 'var(--txt-dim)' };
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
      <div className="panel rise" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p className="mono" style={{ color: 'var(--txt-dim)', fontSize: 12.5 }}>
          No businesses with phone numbers in the queue.
        </p>
      </div>
    );
  }

  if (callIdx >= queue.length) {
    return (
      <div className="panel edge rise" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <StatusDot color="var(--ok)" size={7} />
          <span className="chrome" style={{ fontSize: 21, fontWeight: 700 }}>Queue complete.</span>
        </div>
        <p className="mono" style={{ color: 'var(--txt-dim)', fontSize: 12 }}>
          {done.length} calls logged this session
        </p>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 360, margin: '24px auto 0' }}>
          {done.slice(0, 8).map((d, i) => {
            const g = outcomeGlyph(d.outcome);
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 2px', borderBottom: '1px solid var(--line)', fontSize: 12,
              }}>
                <span style={{ color: 'var(--txt-mid)' }}>{d.name}</span>
                <span className="mono" style={{ color: g.color, fontSize: 11 }}>{g.glyph} {d.outcome}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="queue-grid">

      {/* ── Main call card ── */}
      <div>
        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
          <span className="mono tnum" style={{ fontSize: 11, color: 'var(--txt-dim)', whiteSpace: 'nowrap' }}>
            {callIdx + 1} / {queue.length} · {remaining - 1} remaining
          </span>
          <div style={{ flex: 1 }}>
            <ProgressBar value={callIdx / queue.length} height={5} />
          </div>
        </div>

        {/* Business card */}
        <div className="panel edge rise" style={{ padding: '26px 26px 22px', marginBottom: 16 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 20 }}>
            <div>
              <h2 className="chrome" style={{ margin: '0 0 7px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
                {current.name}
              </h2>
              <p className="mono" style={{ margin: 0, fontSize: 11.5, color: 'var(--txt-dim)' }}>
                {current.address?.split(',').slice(0, 2).join(',')} · {current.category}
                {current.rating ? ` · ${current.rating}★ (${current.review_count})` : ''}
              </p>
            </div>
            {current.demo_url && (
              <a href={current.demo_url} target="_blank" rel="noreferrer"
                className="btn-chrome"
                style={{ fontSize: 10, padding: '4px 12px', flexShrink: 0 }}>
                demo →
              </a>
            )}
          </div>

          {/* Phone number — big and tappable */}
          <a href={`tel:${current.phone}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 14, background: '#000', border: '1px solid var(--line-2)',
            borderRadius: 12, padding: '20px 24px',
            marginBottom: 20, position: 'relative',
          }}>
            <StatusDot color="var(--ok)" pulse size={7} />
            <span className="mono tnum chrome" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '0.04em' }}>
              {current.phone}
            </span>
            <span className="label" style={{
              position: 'absolute', right: 14, bottom: 9, fontSize: 8.5, color: 'var(--txt-faint)',
            }}>
              tap to call
            </span>
          </a>

          {/* Pitch script */}
          <div style={{
            background: 'var(--panel-2)', border: '1px dashed var(--line-2)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          }}>
            <p className="label" style={{ margin: '0 0 6px', fontSize: 9.5 }}>Pitch</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--txt-mid)', lineHeight: 1.65 }}>
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
            className="field mono"
            style={{ width: '100%', fontSize: 12, resize: 'vertical', minHeight: 60 }}
          />
        </div>

        {/* Outcome buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {OUTCOME_BTNS.map(btn => (
            <button
              key={btn.key}
              onClick={() => logOutcome(btn.key)}
              disabled={logging}
              className="mono"
              style={{
                padding: '12px 8px', borderRadius: 10, border: `1px solid ${btn.color}33`,
                background: btn.bg, color: btn.color,
                fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer',
                opacity: logging ? 0.5 : 1,
                transition: 'opacity 0.15s, border-color 0.18s',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sidebar: upcoming ── */}
      <div>
        <p className="label" style={{ marginBottom: 12 }}>Up next</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {queue.slice(callIdx + 1, callIdx + 8).map((biz, i) => (
            <div key={biz.place_id} className="panel" style={{
              padding: '10px 13px', borderRadius: 10,
              opacity: Math.max(0.4, 1 - i * 0.08),
            }}>
              <div style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: 500 }}>{biz.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 3 }}>
                {biz.category}
                {biz.rating ? ` · ${biz.rating}★` : ''}
                {biz.demo_url ? <span style={{ color: 'var(--silver)' }}> · demo ✓</span> : ''}
              </div>
            </div>
          ))}
        </div>

        {/* Session log */}
        {done.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p className="label" style={{ marginBottom: 10 }}>Called this session</p>
            {done.slice(0, 10).map((d, i) => {
              const g = outcomeGlyph(d.outcome);
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 0', borderBottom: '1px solid var(--line)',
                  fontSize: 11,
                }}>
                  <span style={{ color: 'var(--txt-dim)' }}>{d.name.slice(0, 22)}</span>
                  <span className="mono" style={{ color: g.color }}>{g.glyph}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
