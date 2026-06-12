'use client';

import { useState } from 'react';
import { BusinessTable } from './BusinessTable';
import { CallQueue } from './CallQueue';

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
  notes: string | null;
}

export function BusinessPageTabs({ businesses }: { businesses: Business[] }) {
  const [tab, setTab] = useState<'pipeline' | 'queue'>('pipeline');

  const queueCount = businesses.filter(b =>
    b.phone && !['not_interested', 'closed', 'phone_interested'].includes(b.outreach_status ?? '')
  ).length;

  const tabs = [
    { id: 'pipeline' as const, label: 'Pipeline', count: businesses.length },
    { id: 'queue'    as const, label: 'Call queue', count: queueCount },
  ];

  return (
    <>
      {/* Tab bar — same voice as the Shell nav, one level down */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--line)' }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="mono tab"
              style={{
                padding: '9px 13px 11px',
                fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: active ? 'var(--white)' : 'var(--txt-dim)',
                background: 'none',
                border: 'none',
                borderBottom: active ? '1px solid var(--silver)' : '1px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
              }}
            >
              {t.label}
              <span className="tnum" style={{ marginLeft: 7, color: active ? 'var(--txt-mid)' : 'var(--txt-faint)' }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'pipeline' && <BusinessTable businesses={businesses} />}
      {tab === 'queue'    && <CallQueue businesses={businesses} />}
    </>
  );
}
