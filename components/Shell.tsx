'use client';

// ── CEO OS v2 — shared shell: nav tabs + subpage header ───────

import { ChromeIcon, StatusDot, useClock } from './chrome';

export const NAV_TABS = [
  { label: 'Fleet',         href: '/' },
  { label: 'Ask the CEO',   href: '/ceo',        isNew: true },
  { label: 'Memory graph',  href: '/graph',      isNew: true },
  { label: 'Social studio', href: '/social',     isNew: true },
  { label: 'Pipeline',      href: '/businesses' },
  { label: 'Finance',       href: '/finance',    isNew: true },
  { label: 'Portfolio',     href: '/portfolio' },
] as const;

// Public demo only exposes the two surfaces that work without live data /
// the auth gate. Everything else stays behind the login wall.
export const DEMO_NAV_TABS = [
  { label: 'Fleet',       href: '/demo' },
  { label: 'Ask the CEO', href: '/demo/ceo', isNew: true },
  { label: 'Portfolio',   href: '/portfolio' },
] as const;

export function Nav({ active, demo = false }: { active: string; demo?: boolean }) {
  const tabs = demo ? DEMO_NAV_TABS : NAV_TABS;
  return (
    <nav style={{ display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid var(--line)', marginBottom: 24, overflowX: 'auto' }}>
      {demo && (
        <span className="mono" style={{
          fontSize: 9, letterSpacing: '0.18em', color: '#030304', background: 'var(--silver, #d7dae2)',
          padding: '3px 8px', borderRadius: 5, marginRight: 4, whiteSpace: 'nowrap', fontWeight: 600,
        }}>DEMO</span>
      )}
      {tabs.map((t) => {
        const isActive = t.label === active;
        return (
          <a key={t.label} href={t.href} className="mono tab"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 13px 12px', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: isActive ? 'var(--white)' : 'var(--txt-dim)',
              borderBottom: isActive ? '1px solid var(--silver)' : '1px solid transparent',
              marginBottom: -1, whiteSpace: 'nowrap',
            }}>
            {t.label}
            {'isNew' in t && t.isNew && !isActive && (
              <span style={{ width: 4, height: 4, borderRadius: 99, background: 'var(--silver)', boxShadow: '0 0 6px rgba(215,218,226,0.8)', display: 'inline-block' }} />
            )}
          </a>
        );
      })}
    </nav>
  );
}

// slim header for subpages — same chrome voice, less ceremony
export function PageHeader({ title, sub }: { title: string; sub?: React.ReactNode }) {
  const now = useClock();
  const h = now.getHours();
  const hh = ((h % 12) || 12);
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const mer = h < 12 ? 'AM' : 'PM';
  return (
    <header style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 20, paddingBottom: 14,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
          <ChromeIcon src="/assets/crown.png" size={26} radius={7} />
          <span className="label" style={{ color: 'var(--txt-mid)', fontSize: 10.5, letterSpacing: '0.3em' }}>
            CEO&nbsp;OS · CHARLES ETHAN OW
          </span>
        </div>
        <h1 className="chrome" style={{
          margin: 0, fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 27,
          letterSpacing: '-0.012em', lineHeight: 1.1,
        }}>{title}</h1>
        {sub && <p style={{ margin: '7px 0 0', color: 'var(--txt-mid)', fontSize: 13.5 }}>{sub}</p>}
      </div>
      <div style={{ textAlign: 'right' }}>
        {/* live clock: server and client render different seconds — not a real mismatch */}
        <div suppressHydrationWarning className="mono tnum" style={{ fontSize: 22, color: 'var(--white)', lineHeight: 1, whiteSpace: 'nowrap' }}>
          {hh}:{mm}:{ss}<span suppressHydrationWarning style={{ fontSize: 12, color: 'var(--txt-mid)', marginLeft: 5 }}>{mer}</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 9 }}>
          <StatusDot color="var(--ok)" pulse size={6} />
          <span className="label" style={{ color: 'var(--silver)', fontSize: 9.5 }}>all systems live</span>
        </div>
      </div>
    </header>
  );
}
