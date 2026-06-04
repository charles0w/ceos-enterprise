export const dynamic = 'force-dynamic';

import { sql } from '@vercel/postgres';
import { BusinessTable } from '@/components/BusinessTable';
import { CallQueue } from '@/components/CallQueue';

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
  updated_at: string;
}

async function getBusinesses(): Promise<Business[]> {
  try {
    const { rows } = await sql`
      SELECT
        place_id, name, category, rating, review_count,
        address, phone, status, demo_url, owner_email, owner_name,
        outreach_status, outreach_sent_at, outreach_replied_at,
        outreach_subject, outreach_body_id, closed_amount, notes, updated_at
      FROM businesses
      ORDER BY rating DESC, review_count DESC
    `;
    return rows as Business[];
  } catch {
    return [];
  }
}

export default async function BusinessesPage() {
  const businesses = await getBusinesses();

  const counts = {
    total: businesses.length,
    sitesBuilt: businesses.filter(b => b.demo_url).length,
    emailed: businesses.filter(b => b.outreach_sent_at).length,
    replied: businesses.filter(b => b.outreach_replied_at).length,
    closed: businesses.filter(b => b.closed_amount).length,
  };

  return (
    <main style={{ maxWidth: 1300, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
        <a href="/" style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}>← fleet</a>
        <h1 style={{ margin: 0 }}>Growth pipeline</h1>
      </div>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 20 }}>
        berkeley-biz-websites · {counts.total} leads
      </p>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 24, marginBottom: 24, padding: '12px 16px',
        background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 10, fontSize: 13,
      }}>
        {[
          { label: 'scraped',    value: counts.total,     color: '#fff' },
          { label: 'sites built', value: counts.sitesBuilt, color: counts.sitesBuilt > 0 ? '#f59e0b' : '#555' },
          { label: 'emailed',   value: counts.emailed,   color: counts.emailed > 0 ? '#3b82f6' : '#555' },
          { label: 'replied',   value: counts.replied,   color: counts.replied > 0 ? '#a78bfa' : '#555' },
          { label: 'closed',    value: counts.closed,    color: counts.closed > 0 ? '#22c55e' : '#555' },
        ].map(({ label, value, color }) => (
          <span key={label} style={{ color: '#888' }}>
            <span style={{ color, fontWeight: 600 }}>{value}</span> {label}
          </span>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #1f1f1f' }}>
        {[
          { id: 'pipeline', label: 'Pipeline', count: counts.total },
          { id: 'queue', label: '📞 Call Queue', count: businesses.filter(b => b.phone && !['not_interested','closed','phone_interested'].includes(b.outreach_status ?? '')).length },
        ].map(tab => (
          <a
            key={tab.id}
            href={`?tab=${tab.id}`}
            style={{
              padding: '8px 16px 10px', fontSize: 13, textDecoration: 'none',
              color: '#555', borderBottom: '2px solid transparent',
            }}
          >
            {tab.label}
            <span style={{ marginLeft: 6, fontSize: 11, color: '#333' }}>{tab.count}</span>
          </a>
        ))}
      </div>

      <BusinessTable businesses={businesses} />
      <div style={{ marginTop: 40, borderTop: '1px solid #111', paddingTop: 32 }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: '#ccc' }}>
          📞 Call Queue
        </h2>
        <CallQueue businesses={businesses} />
      </div>
    </main>
  );
}
