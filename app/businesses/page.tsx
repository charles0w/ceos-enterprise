export const dynamic = 'force-dynamic';

import { sql } from '@vercel/postgres';

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
  outreach_status: string;
  outreach_sent_at: string | null;
  outreach_replied_at: string | null;
  closed_amount: number | null;
  updated_at: string;
}

async function getBusinesses(): Promise<Business[]> {
  try {
    const { rows } = await sql`
      SELECT
        place_id, name, category, rating, review_count,
        address, phone, status, demo_url, owner_email,
        outreach_status, outreach_sent_at, outreach_replied_at,
        closed_amount, updated_at
      FROM businesses
      ORDER BY rating DESC, review_count DESC
    `;
    return rows as Business[];
  } catch {
    return [];
  }
}

function statusBadge(biz: Business) {
  if (biz.closed_amount) return { label: `closed $${biz.closed_amount}`, color: '#22c55e' };
  if (biz.outreach_replied_at) return { label: 'replied', color: '#a78bfa' };
  if (biz.outreach_sent_at) return { label: 'emailed', color: '#3b82f6' };
  if (biz.demo_url) return { label: 'site built', color: '#f59e0b' };
  if (biz.status === 'error') return { label: 'error', color: '#ef4444' };
  return { label: 'scraped', color: '#374151' };
}

export default async function BusinessesPage() {
  const businesses = await getBusinesses();

  const counts = {
    total: businesses.length,
    sitesBuilt: businesses.filter((b) => b.demo_url).length,
    emailed: businesses.filter((b) => b.outreach_sent_at).length,
    replied: businesses.filter((b) => b.outreach_replied_at).length,
    closed: businesses.filter((b) => b.closed_amount).length,
  };

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
        <a href="/" style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}>← fleet</a>
        <h1 style={{ margin: 0 }}>Growth pipeline</h1>
      </div>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 20 }}>berkeley-biz-websites · {counts.total} leads</p>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 24, marginBottom: 24, padding: '12px 16px',
        background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 10, fontSize: 13,
      }}>
        {[
          { label: 'scraped', value: counts.total, color: '#fff' },
          { label: 'sites built', value: counts.sitesBuilt, color: counts.sitesBuilt > 0 ? '#f59e0b' : '#555' },
          { label: 'emailed', value: counts.emailed, color: counts.emailed > 0 ? '#3b82f6' : '#555' },
          { label: 'replied', value: counts.replied, color: counts.replied > 0 ? '#a78bfa' : '#555' },
          { label: 'closed', value: counts.closed, color: counts.closed > 0 ? '#22c55e' : '#555' },
        ].map(({ label, value, color }) => (
          <span key={label} style={{ color: '#888' }}>
            <span style={{ color, fontWeight: 600 }}>{value}</span> {label}
          </span>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1f1f1f', color: '#555', textAlign: 'left' }}>
              {['Business', 'Category', 'Rating', 'Phone', 'Status', 'Demo'].map((h) => (
                <th key={h} style={{ padding: '8px 12px', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {businesses.map((biz) => {
              const badge = statusBadge(biz);
              return (
                <tr key={biz.place_id} style={{ borderBottom: '1px solid #111' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ color: '#ddd', fontWeight: 500 }}>{biz.name}</div>
                    <div style={{ color: '#444', fontSize: 11, marginTop: 2 }}>{biz.address?.split(',')[1]?.trim()}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#666' }}>{biz.category}</td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>
                    {biz.rating ? `${biz.rating}★` : '—'}
                    {biz.review_count ? <span style={{ color: '#444', fontSize: 11 }}> ({biz.review_count})</span> : null}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#555', fontFamily: 'monospace', fontSize: 11 }}>{biz.phone || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 999,
                      background: '#111', border: `1px solid ${badge.color}33`,
                      color: badge.color,
                    }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {biz.demo_url ? (
                      <a href={biz.demo_url} target="_blank" rel="noreferrer"
                        style={{ color: '#3b82f6', fontSize: 11, textDecoration: 'none' }}>
                        view →
                      </a>
                    ) : <span style={{ color: '#333' }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
