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
    { id: 'queue'    as const, label: '📞 Call Queue', count: queueCount },
  ];

  return (
    <>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #1f1f1f' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px 10px',
              fontSize: 13,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#ddd' : '#555',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === t.id ? '#3b82f6' : 'transparent'}`,
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {t.label}
            <span style={{ marginLeft: 6, fontSize: 11, color: tab === t.id ? '#555' : '#333' }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === 'pipeline' && <BusinessTable businesses={businesses} />}
      {tab === 'queue'    && <CallQueue businesses={businesses} />}
    </>
  );
}
