export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { sql } from '@vercel/postgres';

// Public sales page (PUBLIC_PREFIXES in middleware.ts) — prospects land here
// from outreach emails. Wears the v2 black+chrome material but stays
// standalone: no Shell nav, no CEO OS branding, and no /assets/* imagery
// (those paths are session-gated and would bounce a prospect to /login).
export const metadata: Metadata = {
  title: 'Berkeley Web Studio',
  description: 'Websites for Berkeley businesses — built from your real Google Maps photos and info, live in 48 hours.',
};

// mirrors CHROME_GRAD in components/chrome.tsx (client module — can't import into a server component)
const CHROME_GRAD = 'linear-gradient(90deg, #5b5e68, #b9bcc7 45%, #f2f3f7 60%, #9a9da8)';

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

interface Tier {
  name: string;
  price: string;
  sub: string;
  accent: string;
  border: string;
  featured?: boolean;
  badge?: string;
  badgeStyle?: React.CSSProperties;
  features: string[];
}

const TIERS: Tier[] = [
  {
    name: 'Basic',
    price: '$299',
    sub: 'one-time',
    accent: 'var(--txt-mid)',
    border: 'var(--line)',
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
    sub: 'one-time',
    accent: 'var(--white)',
    border: 'var(--line-2)',
    featured: true,
    badge: 'Most popular',
    badgeStyle: { background: CHROME_GRAD, color: '#06070a' },
    features: [
      'Unique layout designed for your brand',
      '5 pages: Home, About, Services, Gallery, Contact',
      'Professional copywriting',
      'Custom domain setup',
      'SEO basics + Google Analytics',
      '2 rounds of revisions',
    ],
  },
  {
    name: 'Growth',
    price: '$400',
    sub: '/month',
    accent: 'var(--gold)',
    border: 'rgba(217,185,124,0.3)',
    badge: '★ Most revenue',
    badgeStyle: {
      background: 'rgba(217,185,124,0.12)',
      border: '1px solid rgba(217,185,124,0.4)',
      color: 'var(--gold)',
    },
    features: [
      'I actively bring you new customers',
      'AI chat converts site visitors to bookings 24/7',
      'Online booking — no more missed calls',
      'Automated reminders cut no-shows',
      'Google review campaigns grow your rating',
      'Monthly report: how many customers I drove',
      'Social content & Google Business updates',
      'Cancel anytime — no contracts',
    ],
  },
];

function CtaButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{
      display: 'inline-block',
      background: CHROME_GRAD,
      color: '#06070a',
      padding: '13px 28px',
      borderRadius: 10,
      fontWeight: 600,
      fontSize: 14.5,
      boxShadow: 'var(--glow-silver)',
    }}>
      {children}
    </a>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 className="label" style={{ fontSize: 11, letterSpacing: '0.26em', color: 'var(--txt-mid)', marginBottom: 7 }}>
        {title}
      </h2>
      <p style={{ color: 'var(--txt-dim)', fontSize: 13, margin: 0 }}>{sub}</p>
    </div>
  );
}

export default async function PortfolioPage() {
  const demos = await getDemoSites();

  return (
    <main className="page" style={{ maxWidth: 1080, margin: '0 auto' }}>
      {/* Wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 52 }}>
        <span className="label" style={{ fontSize: 10.5, letterSpacing: '0.3em', color: 'var(--txt-mid)' }}>
          Berkeley&nbsp;Web&nbsp;Studio
        </span>
        <span className="label" style={{ fontSize: 9.5 }}>Berkeley, CA</span>
      </div>

      {/* Hero */}
      <div className="rise" style={{ textAlign: 'center', marginBottom: 64 }}>
        <p className="label" style={{ fontSize: 10, letterSpacing: '0.3em', margin: '0 0 14px', color: 'var(--txt-dim)' }}>
          Websites · Local SEO · Bookings
        </p>
        <h1 className="chrome" style={{
          fontSize: 'clamp(30px, 5.2vw, 44px)', fontWeight: 700, margin: '0 0 16px',
          letterSpacing: '-0.018em', lineHeight: 1.08,
        }}>
          Websites for Berkeley businesses.
        </h1>
        <p style={{ color: 'var(--txt-mid)', fontSize: 15.5, maxWidth: 540, margin: '0 auto 32px', lineHeight: 1.6 }}>
          Built from your real Google Maps photos and info. Live in 48 hours.
          Or let me actively bring you customers every month — bookings, reminders, reviews, and more.
        </p>
        <CtaButton href="mailto:charles_ow@berkeley.edu?subject=Website inquiry">
          Get your free demo →
        </CtaButton>
      </div>

      {/* Pricing */}
      <div style={{ marginBottom: 64 }}>
        <SectionHead
          title="Pricing"
          sub="Start with a one-time site. Upgrade to Growth anytime for bookings, AI chat, and more."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={tier.featured ? 'panel edge' : 'panel'}
              style={{
                borderColor: tier.border,
                padding: '26px 22px',
                boxShadow: tier.featured ? 'var(--glow-silver)' : undefined,
              }}
            >
              {tier.badge && (
                <span className="mono" style={{
                  position: 'absolute',
                  top: -10,
                  left: 16,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  padding: '3px 9px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                  ...tier.badgeStyle,
                }}>
                  {tier.badge}
                </span>
              )}
              <div className="label" style={{ marginBottom: 10 }}>{tier.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
                <span className="mono tnum" style={{ fontSize: 32, fontWeight: 600, color: tier.accent, lineHeight: 1 }}>
                  {tier.price}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--txt-dim)' }}>{tier.sub}</span>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {tier.features.map((f) => (
                  <li key={f} style={{ fontSize: 13, color: 'var(--txt)', marginBottom: 9, paddingLeft: 18, position: 'relative', lineHeight: 1.45 }}>
                    <span className="mono" style={{ position: 'absolute', left: 0, color: 'var(--ok)', fontSize: 11, top: 2 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p style={{ color: 'var(--txt-dim)', fontSize: 12, marginTop: 14 }}>
          Reply "basic", "custom", or "growth" to the intro email — I handle the rest.
          Growth plan includes a one-time $599 setup fee for the custom build.
        </p>
      </div>

      {/* Demo gallery */}
      <div>
        <SectionHead
          title="Live demos"
          sub="These sites were auto-generated from Google Maps data. Custom tier produces unique designs."
        />

        {demos.length === 0 ? (
          <div className="mono" style={{
            border: '1px dashed var(--line-2)', borderRadius: 14, padding: 40,
            textAlign: 'center', color: 'var(--txt-dim)', fontSize: 12.5,
          }}>
            Demo sites being built — check back soon.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {demos.map((site) => (
              <a key={site.demo_url} href={site.demo_url} target="_blank" rel="noreferrer">
                <div className="panel card-hover" style={{ borderRadius: 14, padding: 20, height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <strong style={{ color: 'var(--white)', fontSize: 14, fontWeight: 500 }}>{site.name}</strong>
                    <span className="mono" style={{
                      fontSize: 9.5, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em',
                      padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)', whiteSpace: 'nowrap',
                    }}>
                      {site.category}
                    </span>
                  </div>
                  <p style={{ color: 'var(--txt-dim)', fontSize: 12, margin: '0 0 14px' }}>
                    {site.address?.split(',').slice(0, 2).join(',')}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono tnum" style={{ color: 'var(--txt-mid)', fontSize: 12 }}>
                      {site.rating}★ <span style={{ color: 'var(--txt-faint)' }}>({site.review_count})</span>
                    </span>
                    <span className="mono" style={{ color: 'var(--silver)', fontSize: 11 }}>view site →</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="panel edge" style={{ marginTop: 64, textAlign: 'center', padding: '44px 24px' }}>
        <h2 className="chrome" style={{ fontSize: 23, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.012em' }}>
          Want a free demo for your business?
        </h2>
        <p style={{ color: 'var(--txt-mid)', marginBottom: 26, fontSize: 14 }}>
          I'll build one using your Google Maps info. No commitment required.
        </p>
        <CtaButton href="mailto:charles_ow@berkeley.edu?subject=Free demo request">
          Email me →
        </CtaButton>
      </div>

      {/* Footer */}
      <p className="label" style={{ textAlign: 'center', marginTop: 48, fontSize: 9 }}>
        Berkeley Web Studio · charles_ow@berkeley.edu
      </p>
    </main>
  );
}
