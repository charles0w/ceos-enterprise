'use client';

import { useState } from 'react';

interface Business {
  place_id: string;
  name: string;
  category: string;
  rating: number;
  review_count: number;
  address: string;
  phone: string;
  status: string;
  demo_url: string | null;
  owner_email: string | null;
  owner_name: string | null;
  outreach_status: string;
  outreach_sent_at: string | null;
  outreach_replied_at: string | null;
  outreach_subject: string | null;
  outreach_body_id: string | null;
  closed_amount: number | null;
}

const PORTFOLIO_URL = 'https://ceos-enterprise.vercel.app/portfolio';

function buildEmailText(biz: Business): string {
  const name = biz.name;
  const demo = biz.demo_url ?? '';
  const version = biz.outreach_body_id ?? 'v1';

  if (version === 'v1') {
    return `Subject: ${biz.outreach_subject ?? `Free website preview I made for ${name}`}

Hi there,

I'm Charles — a UC Berkeley student who builds websites for local Berkeley businesses. I put together a free preview site for ${name} this week, built from your real Google Maps photos and info:

👉 ${demo}

This is just a preview — I haven't sent you a bill, and I'm not asking you to commit to anything.

I'd love to hop on a quick 10-minute call to show you what a fully custom version could look like, or answer any questions. No pressure at all — if you love the preview as-is, I can transfer it to you for a flat $299 and you own it outright.

Here's what other Berkeley businesses have gotten:
${PORTFOLIO_URL}

A few things that set this apart from a DIY website builder:
  · Built specifically for ${name} — not a generic template
  · Mobile-first, fast, and professional-looking
  · I handle everything — no tech knowledge needed from you
  · One-time fee, no monthly subscriptions

If a call works, just reply with a time that's good for you and I'll make it happen. Even a quick "not interested" helps me out — I'll move on and won't bother you again.

— Charles
UC Berkeley · charles@charlesbuilds.online`;
  }

  if (version === 'v2') {
    return `Subject: ${biz.outreach_subject ?? `Re: Website for ${name}`}

Hi there,

Bumping this in case it got buried. The ${name} demo is still live:

👉 ${demo}

Quick reminder on pricing:
  · Basic transfer: $299
  · Full custom redesign: $599 (portfolio: ${PORTFOLIO_URL})

Happy to jump on a quick call or answer any questions — just reply here.

— Charles
charles@charlesbuilds.online`;
  }

  return `Subject: ${biz.outreach_subject ?? `Last note — ${name} site`}

Hi there,

Last note before I take the ${name} demo down to free up the URL.

Demo: ${demo}
Portfolio: ${PORTFOLIO_URL}

Basic transfer $299 · Custom redesign $599

If you want it, just reply "yes" and I'll handle the rest. If not, no worries — wishing ${name} the best.

— Charles
charles@charlesbuilds.online`;
}

function statusBadge(biz: Business) {
  if (biz.closed_amount) return { label: `closed $${biz.closed_amount}`, color: '#22c55e' };
  if (biz.outreach_replied_at) return { label: 'replied', color: '#a78bfa' };
  if (biz.outreach_sent_at) return { label: 'emailed', color: '#3b82f6' };
  if (biz.demo_url) return { label: 'site built', color: '#f59e0b' };
  if (biz.status === 'error') return { label: 'error', color: '#ef4444' };
  return { label: 'scraped', color: '#374151' };
}

function relTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

export function BusinessTable({ businesses }: { businesses: Business[] }) {
  const [selected, setSelected] = useState<Business | null>(null);

  return (
    <>
      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1f1f1f', color: '#555', textAlign: 'left' }}>
              {['Business', 'Category', 'Rating', 'Phone', 'Status', 'Sent', 'Demo', 'Email'].map(h => (
                <th key={h} style={{ padding: '8px 12px', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {businesses.map(biz => {
              const badge = statusBadge(biz);
              const hasEmail = !!biz.outreach_sent_at;
              return (
                <tr
                  key={biz.place_id}
                  style={{
                    borderBottom: '1px solid #111',
                    background: selected?.place_id === biz.place_id ? '#0f1620' : 'transparent',
                  }}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ color: '#ddd', fontWeight: 500 }}>{biz.name}</div>
                    <div style={{ color: '#444', fontSize: 11, marginTop: 2 }}>
                      {biz.address?.split(',')[1]?.trim()}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#666' }}>{biz.category}</td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>
                    {biz.rating ? `${biz.rating}★` : '—'}
                    {biz.review_count ? (
                      <span style={{ color: '#444', fontSize: 11 }}> ({biz.review_count})</span>
                    ) : null}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#555', fontFamily: 'monospace', fontSize: 11 }}>
                    {biz.phone || '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 999,
                      background: '#111', border: `1px solid ${badge.color}33`, color: badge.color,
                    }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: 11 }}>
                    {biz.outreach_sent_at ? relTime(biz.outreach_sent_at) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {biz.demo_url ? (
                      <a href={biz.demo_url} target="_blank" rel="noreferrer"
                        style={{ color: '#3b82f6', fontSize: 11, textDecoration: 'none' }}>
                        view →
                      </a>
                    ) : <span style={{ color: '#333' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {hasEmail ? (
                      <button
                        onClick={() => setSelected(selected?.place_id === biz.place_id ? null : biz)}
                        style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 4,
                          background: 'transparent', border: '1px solid #2a2a2a',
                          color: '#888', cursor: 'pointer',
                        }}
                      >
                        {selected?.place_id === biz.place_id ? 'close' : 'view email'}
                      </button>
                    ) : (
                      <span style={{ color: '#2a2a2a', fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Email preview slide-over */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={() => setSelected(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
          />

          {/* Panel */}
          <div style={{
            position: 'relative', zIndex: 51,
            width: '100%', maxWidth: 560,
            background: '#0a0a0a', borderLeft: '1px solid #1f1f1f',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '20px 24px', borderBottom: '1px solid #1f1f1f',
              position: 'sticky', top: 0, background: '#0a0a0a',
            }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: '#ddd' }}>{selected.name}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#555' }}>
                  {selected.outreach_body_id?.toUpperCase() ?? 'V1'} ·{' '}
                  {selected.owner_email} ·{' '}
                  {selected.outreach_sent_at ? relTime(selected.outreach_sent_at) : ''}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: 'none', border: 'none', color: '#555',
                  cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>

            {/* Reply status banner */}
            {selected.outreach_replied_at && (
              <div style={{
                margin: '16px 24px 0',
                padding: '10px 14px',
                background: '#1a1040',
                border: '1px solid #a78bfa44',
                borderRadius: 6,
                fontSize: 12,
                color: '#a78bfa',
              }}>
                ✓ Replied {relTime(selected.outreach_replied_at)}
              </div>
            )}

            {/* Email body */}
            <pre style={{
              margin: '20px 24px 24px',
              padding: '16px',
              background: '#111',
              border: '1px solid #1f1f1f',
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.7,
              color: '#ccc',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'ui-monospace, monospace',
            }}>
              {buildEmailText(selected)}
            </pre>

            {/* Demo link */}
            {selected.demo_url && (
              <div style={{ padding: '0 24px 24px' }}>
                <a
                  href={selected.demo_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12, color: '#3b82f6', textDecoration: 'none',
                    padding: '8px 14px', border: '1px solid #1e3a5f',
                    borderRadius: 6, background: '#0f1e30',
                  }}
                >
                  View demo site →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
