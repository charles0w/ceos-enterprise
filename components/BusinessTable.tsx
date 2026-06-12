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

// hex mirrors of the globals.css tokens — literal so the badge border can carry an alpha suffix
function statusBadge(biz: Business) {
  if (biz.closed_amount) return { label: `closed $${biz.closed_amount}`, color: '#3fe08f' };
  if (biz.outreach_replied_at) return { label: 'replied', color: '#d9b97c' };
  if (biz.outreach_sent_at) return { label: 'emailed', color: '#d7dae2' };
  if (biz.demo_url) return { label: 'site built', color: '#9a9da8' };
  if (biz.status === 'error') return { label: 'error', color: '#f25c5c' };
  return { label: 'scraped', color: '#54565e' };
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
      <div className="panel rise" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
              {['Business', 'Category', 'Rating', 'Phone', 'Status', 'Sent', 'Demo', 'Email'].map(h => (
                <th key={h} className="mono" style={{
                  padding: '11px 14px', fontWeight: 400, fontSize: 10,
                  letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--txt-dim)',
                }}>{h}</th>
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
                    borderBottom: '1px solid var(--line)',
                    background: selected?.place_id === biz.place_id ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ color: 'var(--white)', fontWeight: 500 }}>{biz.name}</div>
                    <div style={{ color: 'var(--txt-dim)', fontSize: 11, marginTop: 2 }}>
                      {biz.address?.split(',')[1]?.trim()}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--txt-mid)' }}>{biz.category}</td>
                  <td className="mono tnum" style={{ padding: '10px 14px', color: 'var(--txt-mid)', fontSize: 12 }}>
                    {biz.rating ? `${biz.rating}★` : '—'}
                    {biz.review_count ? (
                      <span style={{ color: 'var(--txt-faint)', fontSize: 11 }}> ({biz.review_count})</span>
                    ) : null}
                  </td>
                  <td className="mono tnum" style={{ padding: '10px 14px', color: 'var(--txt-dim)', fontSize: 11 }}>
                    {biz.phone || '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className="mono" style={{
                      fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${badge.color}33`, color: badge.color,
                    }}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="mono" style={{ padding: '10px 14px', color: 'var(--txt-dim)', fontSize: 11 }}>
                    {biz.outreach_sent_at ? relTime(biz.outreach_sent_at) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {biz.demo_url ? (
                      <a href={biz.demo_url} target="_blank" rel="noreferrer"
                        className="mono" style={{ color: 'var(--silver)', fontSize: 11 }}>
                        view →
                      </a>
                    ) : <span style={{ color: 'var(--txt-faint)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {hasEmail ? (
                      <button
                        onClick={() => setSelected(selected?.place_id === biz.place_id ? null : biz)}
                        className="btn-chrome"
                        style={{ fontSize: 10, padding: '3px 10px', borderRadius: 7 }}
                      >
                        {selected?.place_id === biz.place_id ? 'close' : 'email'}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--txt-faint)', fontSize: 11 }}>—</span>
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
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }}
          />

          {/* Panel */}
          <div style={{
            position: 'relative', zIndex: 51,
            width: '100%', maxWidth: 560,
            background: 'var(--panel)', borderLeft: '1px solid var(--line)',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
            boxShadow: '-20px 0 50px -30px rgba(0,0,0,0.9)',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '20px 24px 16px', borderBottom: '1px solid var(--line)',
              position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 1,
            }}>
              <div>
                <p className="chrome" style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>{selected.name}</p>
                <p className="mono" style={{ margin: '6px 0 0', fontSize: 10.5, color: 'var(--txt-dim)' }}>
                  {selected.outreach_body_id?.toUpperCase() ?? 'V1'} ·{' '}
                  {selected.owner_email} ·{' '}
                  {selected.outreach_sent_at ? relTime(selected.outreach_sent_at) : ''}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: 'none', border: 'none', color: 'var(--txt-mid)',
                  cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>

            {/* Reply status banner */}
            {selected.outreach_replied_at && (
              <div className="mono" style={{
                margin: '16px 24px 0',
                padding: '10px 14px',
                background: 'rgba(217,185,124,0.07)',
                border: '1px solid rgba(217,185,124,0.3)',
                borderRadius: 8,
                fontSize: 11.5,
                color: 'var(--gold)',
              }}>
                ✓ Replied {relTime(selected.outreach_replied_at)}
              </div>
            )}

            {/* Email body */}
            <pre className="mono" style={{
              margin: '20px 24px 24px',
              padding: '16px',
              background: 'var(--panel-2)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              fontSize: 12,
              lineHeight: 1.7,
              color: 'var(--txt)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
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
                  className="btn-chrome"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}
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
