export const dynamic = 'force-dynamic';

import { sql } from '@vercel/postgres';
import { BusinessPageTabs } from '@/components/BusinessPageTabs';

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

      <BusinessPageTabs businesses={businesses} />
    </main>
  );
}
