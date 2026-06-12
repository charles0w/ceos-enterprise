export const dynamic = 'force-dynamic';

import { sql } from '@vercel/postgres';
import { Nav, PageHeader } from '@/components/Shell';
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

  const closedRows = businesses.filter(b => b.closed_amount);
  const closedTotal = closedRows.reduce((s, b) => s + Number(b.closed_amount ?? 0), 0);

  const funnel = [
    { label: 'scraped',     value: businesses.length },
    { label: 'sites built', value: businesses.filter(b => b.demo_url).length },
    { label: 'emailed',     value: businesses.filter(b => b.outreach_sent_at).length },
    { label: 'replied',     value: businesses.filter(b => b.outreach_replied_at).length, color: 'var(--gold)' },
    { label: 'closed',      value: closedRows.length, color: 'var(--ok)',
      suffix: closedTotal > 0 ? ` · $${closedTotal.toLocaleString()}` : undefined },
  ];

  return (
    <main className="page" style={{ maxWidth: 1320, margin: '0 auto' }}>
      <PageHeader
        title="Growth pipeline."
        sub={`berkeley-biz-websites · ${businesses.length} leads under management`}
      />
      <Nav active="Pipeline" />

      {/* funnel strip — color only where status earns it */}
      <section className="panel edge rise" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: 18, padding: '18px 20px', marginBottom: 18,
      }}>
        {funnel.map(stage => (
          <div key={stage.label}>
            <div className="label">{stage.label}</div>
            <div className="mono tnum" style={{
              fontSize: 24, fontWeight: 500, marginTop: 6, lineHeight: 1,
              color: stage.value > 0 ? (stage.color ?? 'var(--white)') : 'var(--txt-faint)',
            }}>
              {stage.value}
              {stage.suffix && (
                <span style={{ fontSize: 12, color: 'var(--txt-mid)' }}>{stage.suffix}</span>
              )}
            </div>
          </div>
        ))}
      </section>

      <BusinessPageTabs businesses={businesses} />
    </main>
  );
}
