export const dynamic = 'force-dynamic';

import { sql } from '@vercel/postgres';

interface DemoSite {
  name: string;
  category: string;
  rating: number;
  review_count: number;
  demo_url: string;
  address: string;
}

async function getDemoSites(): Promise<DemoSite[]> {
  try {
    const { rows } = await sql`
      SELECT name, category, rating, review_count, demo_url, address
      FROM businesses
      WHERE demo_url IS NOT NULL
      ORDER BY rating DESC, review_count DESC
      LIMIT 12
    `;
    return rows as DemoSite[];
  } catch {
    return [];
  }
}

const TIERS = [
  {
    name: 'Basic',
    price: '$299',
    color: '#555',
    border: '#2a2a2a',
    features: [
      'Demo site transferred to you',
      'Your real Google Maps photos',
      'Mobile-responsive design',
      'Hours, phone & address',
      'You own it outright',
    ],
  },
  {
    name: 'Custom',
    price: '$599',
    color: '#fff',
    border: '#fff',
    badge: 'Most popular',
    features: [
      'Unique layout designed for your brand',
      '5 pages: Home, About, Services, Gallery, Contact',
      'Professional copywriting',
      'Custom domain setup',
      'SEO basics + Google Analytics',
      '2 rounds of revisions',
    ],
  },
];

export default async function PortfolioPage() {
  const demos = await getDemoSites();

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      {/* Nav */}
      <div style={{ marginBottom: 40 }}>
        <a href="/" style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}>← fleet</a>
      </div>

      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
          Berkeley Web Studio
        </p>
        <h1 style={{ fontSize: 36, margin: '0 0 16px', letterSpacing: -1 }}>
          Websites for Berkeley businesses
        </h1>
        <p style={{ color: '#888', fontSize: 16, maxWidth: 520, margin: '0 auto 32px' }}>
          Built from your real Google Maps photos and info. Live in 48 hours.
          No recurring fees — you own it outright.
        </p>
        <a
          href="mailto:charles_ow@berkeley.edu?subject=Website inquiry"
          style={{
            display: 'inline-block',
            background: '#fff',
            color: '#000',
            padding: '12px 28px',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 15,
            textDecoration: 'none',
          }}
        >
          Get your free demo →
        </a>
      </div>

      {/* Pricing */}
      <div style={{ marginBottom: 64 }}>
        <h2 style={{ fontSize: 20, marginBottom: 20, color: '#ccc' }}>Pricing</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 640 }}>
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              style={{
                border: `1px solid ${tier.border}`,
                borderRadius: 12,
                padding: '24px 20px',
                background: '#111',
                position: 'relative',
              }}
            >
              {tier.badge && (
                <span style={{
                  position: 'absolute',
                  top: -10,
                  left: 16,
                  background: '#fff',
                  color: '#000',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  letterSpacing: 0.5,
                }}>
                  {tier.badge}
                </span>
              )}
              <div style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                {tier.name}
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: tier.color, marginBottom: 16 }}>
                {tier.price}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {tier.features.map((f) => (
                  <li key={f} style={{ fontSize: 13, color: '#aaa', marginBottom: 8, paddingLeft: 16, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: '#22c55e' }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p style={{ color: '#555', fontSize: 12, marginTop: 12 }}>
          Reply "basic" or "custom" to the intro email — I handle the rest.
        </p>
      </div>

      {/* Demo gallery */}
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 8, color: '#ccc' }}>Live demos</h2>
        <p style={{ color: '#555', fontSize: 13, marginBottom: 20 }}>
          These sites were auto-generated from Google Maps data. Custom tier produces unique designs.
        </p>

        {demos.length === 0 ? (
          <div style={{ border: '1px dashed #2a2a2a', borderRadius: 12, padding: 40, textAlign: 'center', color: '#444' }}>
            Demo sites being built — check back soon.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {demos.map((site) => (
              <a
                key={site.demo_url}
                href={site.demo_url}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  border: '1px solid #1f1f1f',
                  borderRadius: 12,
                  padding: 20,
                  background: '#111',
                  transition: 'border-color 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <strong style={{ color: '#ddd', fontSize: 14 }}>{site.name}</strong>
                    <span style={{ fontSize: 10, color: '#555', background: '#1a1a1a', padding: '2px 7px', borderRadius: 999, border: '1px solid #2a2a2a' }}>
                      {site.category}
                    </span>
                  </div>
                  <p style={{ color: '#666', fontSize: 12, margin: '0 0 12px' }}>
                    {site.address?.split(',').slice(0, 2).join(',')}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#888', fontSize: 12 }}>
                      {site.rating}★ <span style={{ color: '#444' }}>({site.review_count})</span>
                    </span>
                    <span style={{ color: '#3b82f6', fontSize: 12 }}>view site →</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ marginTop: 64, textAlign: 'center', padding: '40px 24px', border: '1px solid #1f1f1f', borderRadius: 16, background: '#0a0a0a' }}>
        <h2 style={{ fontSize: 22, margin: '0 0 12px' }}>Want a free demo for your business?</h2>
        <p style={{ color: '#888', marginBottom: 24 }}>I'll build one using your Google Maps info. No commitment required.</p>
        <a
          href="mailto:charles_ow@berkeley.edu?subject=Free demo request"
          style={{
            display: 'inline-block',
            background: '#fff',
            color: '#000',
            padding: '12px 28px',
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Email me →
        </a>
      </div>
    </main>
  );
}
