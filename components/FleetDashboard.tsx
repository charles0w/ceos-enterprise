'use client';

// ── CEO OS v2 — Fleet dashboard (black & chrome personal hub) ──
// Home surface: greeting + clock, night-garage hero with rotating
// reminders, The Garage targets, Growth pipeline funnel, live log,
// agent cards driven by getFleet(), and the pixel M4 strip.

import { useState, useEffect, useRef } from 'react';
import type { AgentWithStatus, AgentMetric } from '@/lib/types';
import type { GrowthStats } from '@/lib/growth';
import type { JobStats } from '@/lib/jobs';
import type { GarageData } from '@/lib/garage';
import type { FleetTask } from '@/lib/fleetTasks';
import type { EventFeed } from '@/lib/events';
import {
  CHROME_GRAD, StatusDot, ChromeIcon, GlyphTile, Sparkline, ProgressBar,
  Kpi, PanelHead, useClock, useCountUp, useRotator, fmtMoney, fmtNum, greetingFor,
} from './chrome';
import { Nav } from './Shell';

const STATE_META: Record<string, { color: string; label: string }> = {
  ok:    { color: '#3fe08f', label: 'operational' },
  warn:  { color: '#f2c14e', label: 'degraded' },
  error: { color: '#f25c5c', label: 'error' },
  idle:  { color: '#3c3c44', label: 'standby' },
};

// ── per-agent presentation config ─────────────────────────────
// Sigils are the user-supplied chrome photos; agents without one
// get a mono glyph in the same black tile.
interface AgentCfg {
  sigil?: string;
  glyph?: string;
  uptime: number | null;
  note?: string;
  link?: { label: string; href: string };
}
const AGENT_CFG: Record<string, AgentCfg> = {
  commerce:        { sigil: '/assets/crown.png',       uptime: 99.4 },
  finance:         { sigil: '/assets/dollar.png',      uptime: 98.9, link: { label: 'open trading desk', href: '/finance' } },
  'lambos-trader': { glyph: 'Λ',                       uptime: 97.6 },
  growth:          { sigil: '/assets/chrome-star.png', uptime: 99.1, link: { label: 'open pipeline', href: '/businesses' } },
  jobs:            { glyph: '▤',                       uptime: 99.0 },
  social:          { sigil: '/assets/tiktok.png',      uptime: 96.2 },
  hobbies:         { sigil: '/assets/vinyl.png',       uptime: null, note: 'awaiting assignment' },
  school:          { sigil: '/assets/esc-key.png',     uptime: null, note: 'provisioning — Phase 4' },
};

function Sigil({ id, size = 36 }: { id: string; size?: number }) {
  const cfg = AGENT_CFG[id];
  if (cfg?.sigil) return <ChromeIcon src={cfg.sigil} size={size} />;
  return <GlyphTile glyph={cfg?.glyph ?? '○'} size={size} />;
}

// ── decorative 24h sparklines (seeded; throughput sums them) ──
function spark(seed: number, n = 24, base = 50, vol = 18, trend = 0): number[] {
  const out: number[] = [];
  let v = base, s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * vol + trend;
    v = Math.max(2, v);
    out.push(Math.round(v));
  }
  return out;
}
const SPARKS: Record<string, number[]> = {
  commerce:        spark(7,  24, 30, 10,  1.1),
  finance:         spark(13, 24, 60,  9,  0.4),
  'lambos-trader': spark(17, 24, 40, 12,  0.6),
  growth:          spark(3,  24, 20, 14,  2.0),
  jobs:            spark(11, 24, 25, 12,  1.4),
  social:          spark(21, 24, 45, 16, -0.3),
};

// Live task blocks have no real percentage; derive a stable one per
// run so the bar doesn't jump on every refresh.
function hashProgress(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return 0.18 + (Math.abs(h) % 1000) / 1000 * 0.68;
}

// ── the garage — what all of this is for ──────────────────────
// Real targets + prices live in lib/garage.ts (progress = agent profit /
// price). This fallback only renders if the DB is unreachable.
const GARAGE_FALLBACK = [
  { id: '812',    label: 'Ferrari 812 Superfast', sub: 'Rosso Corsa',        progress: 0.06, price: null as number | null },
  { id: 'm4',     label: 'BMW M4 Competition',    sub: 'first key',          progress: 0.22, price: null as number | null, img: '/assets/m-logo.png' },
  { id: 'studio', label: 'Highrise studio',       sub: 'floor 40+, skyline', progress: 0.11, price: null as number | null },
];

// ── quiet reminders — rotate slowly, stay out of the way ──────
const QUOTES = [
  'Quiet moves. Loud results.',
  'The car is the byproduct. Become the man first.',
  'Nobody is coming. Build it yourself.',
  'Discipline buys what motivation window-shops.',
  'Floor 40 is earned one shipped day at a time.',
  'Six agents working while you sleep. Stay sharp while you’re awake.',
];

// ── system log (real fleet_events; see lib/events.ts) ─────────
const SEV_COLOR: Record<string, string> = {
  ok: 'var(--silver)', info: 'var(--silver)', warn: 'var(--gold)', err: 'var(--err)',
};

function qColor(v: number): string {
  return v >= 0.8 ? '#3fe08f' : v >= 0.6 ? '#f2c14e' : '#f25c5c';
}

// ── header ────────────────────────────────────────────────────
function Header({ online, needEye }: { online: number; needEye: number }) {
  const now = useClock();
  const h = now.getHours();
  const hh = ((h % 12) || 12);
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const mer = h < 12 ? 'AM' : 'PM';
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <header style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 20, paddingBottom: 14,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <ChromeIcon src="/assets/crown.png" size={30} radius={8} />
          <span className="label" style={{ color: 'var(--txt-mid)', fontSize: 11, letterSpacing: '0.3em' }}>
            CEO&nbsp;OS · CHARLES ETHAN OW
          </span>
        </div>
        <h1 suppressHydrationWarning className="chrome" style={{
          margin: 0, fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 34,
          letterSpacing: '-0.015em', lineHeight: 1.1,
        }}>
          {greetingFor(h)}, Charles.
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--txt-mid)', fontSize: 14 }}>
          The desk is quiet. <span style={{ color: 'var(--white)' }}>{online} agents</span> are working —{' '}
          {needEye === 0 ? 'nothing needs your eye' : `${needEye} need${needEye === 1 ? 's' : ''} your eye`}.
        </p>
      </div>
      <div style={{ textAlign: 'right' }}>
        {/* live clock: server and client render different seconds — not a real mismatch */}
        <div suppressHydrationWarning className="mono tnum" style={{ fontSize: 30, color: 'var(--white)', letterSpacing: '0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>
          {hh}:{mm}:{ss}<span suppressHydrationWarning style={{ fontSize: 14, color: 'var(--txt-mid)', marginLeft: 6 }}>{mer}</span>
        </div>
        <div suppressHydrationWarning className="mono" style={{ fontSize: 12, color: 'var(--txt-dim)', marginTop: 7, whiteSpace: 'nowrap' }}>{date} · PT</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 9 }}>
          <StatusDot color="#3fe08f" pulse size={7} />
          <span className="label" style={{ color: 'var(--silver)' }}>all systems live</span>
        </div>
      </div>
    </header>
  );
}

// ── hero — the night garage ───────────────────────────────────
function Hero({ fleet, feed }: { fleet: AgentWithStatus[]; feed: EventFeed }) {
  const running = fleet.filter((a) => a.status?.summary).length;
  const ups = fleet
    .map((a) => AGENT_CFG[a.agent.id]?.uptime)
    .filter((u): u is number => u != null);
  const avgUp = ups.length ? ups.reduce((s, u) => s + u, 0) / ups.length : 0;
  const events = useCountUp(feed.count24, 1500);
  const profit = useCountUp(feed.profit24, 1500);
  const [quote, qi] = useRotator(QUOTES);

  return (
    <section className="panel edge rise" style={{ overflow: 'hidden', marginBottom: 20, background: '#050506' }}>
      <div className="hero-grid">
        {/* left — numbers + the reminder */}
        <div style={{ padding: '28px 8px 24px 30px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 44, flexWrap: 'wrap' }}>
            <Kpi label="Running" value={running} />
            <Kpi label="Avg uptime" value={avgUp.toFixed(1)} suffix="%" />
            <Kpi label="Events · 24h" value={fmtNum(events)} />
            <Kpi label="Profit · 24h" value={fmtMoney(profit)} />
          </div>
          {/* quiet reminder */}
          <div key={qi} style={{ marginTop: 'auto', paddingTop: 26, animation: 'quoteIn 0.9s ease both' }}>
            <div className="label" style={{ marginBottom: 8, color: 'var(--txt-faint)' }}>reminder</div>
            <div className="chrome" style={{
              fontSize: 19, fontWeight: 600, letterSpacing: '0.005em', maxWidth: 420, lineHeight: 1.35,
            }}>
              “{quote}”
            </div>
          </div>
        </div>
        {/* right — the esc key waiting in the dark */}
        <div style={{ position: 'relative', minHeight: 230, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/esc-key.png" alt="" className="blend" style={{
            position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            width: '64%', maxWidth: 300,
            animation: 'headlights 6s ease-in-out infinite',
          }} />
          <div className="mono" style={{
            position: 'absolute', right: 18, top: 16, fontSize: 9.5,
            letterSpacing: '0.22em', color: 'var(--txt-faint)', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>it&rsquo;s waiting</div>
        </div>
      </div>
      {/* throughput strip — real fleet_events, hourly buckets */}
      <div style={{ padding: '12px 24px 18px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span className="label">Throughput · 24h</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>events/hr</span>
        </div>
        <Throughput data={feed.hourly.length ? feed.hourly : [0, 0]} height={58} />
      </div>
    </section>
  );
}

function Throughput({ data, height = 64 }: { data: number[]; height?: number }) {
  const width = 100;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const X = (i: number) => (i / (data.length - 1)) * width;
  const Y = (v: number) => height - 4 - ((v - min) / range) * (height - 12);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)} ${Y(v).toFixed(2)}`).join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="thru2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d7dae2" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#d7dae2" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2={width} y1={height * g} y2={height * g}
          stroke="rgba(255,255,255,0.035)" strokeWidth="0.4" />
      ))}
      <path d={area} fill="url(#thru2)" />
      <path d={line} fill="none" stroke="#c9ccd6" strokeWidth="1" vectorEffect="non-scaling-stroke"
        style={{ filter: 'drop-shadow(0 0 3px rgba(226,228,236,0.5))' }} />
    </svg>
  );
}

// ── viz strip: the garage / pipeline funnel / live log ────────
// Sub-1% real progress still deserves a visible number — round to one
// decimal instead of flooring a first win to "0%".
function fmtPct(p: number): string {
  const pct = p * 100;
  if (pct === 0) return '0%';
  if (pct < 1) return pct.toFixed(1) + '%';
  return Math.round(pct) + '%';
}

function Garage({ garage }: { garage: GarageData | null }) {
  const targets = garage ? garage.targets : GARAGE_FALLBACK;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '15px 16px 17px' }}>
      {targets.map((t) => (
        <div key={t.id}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2, minWidth: 0 }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: 'var(--white)', letterSpacing: '0.01em',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>{t.label}</span>
            {t.img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.img} alt="" className="blend" style={{ height: 13, width: 'auto', display: 'block', opacity: 0.9, alignSelf: 'center', flexShrink: 0 }} />
            )}
            <span className="mono tnum" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--silver)', flexShrink: 0 }}>
              {fmtPct(t.progress)}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--txt-dim)', marginBottom: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t.sub}{t.price != null ? ` · ${fmtMoney(t.price)}` : ''}
          </div>
          <ProgressBar value={t.progress} active={false} height={5} />
        </div>
      ))}
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', letterSpacing: '0.06em' }}>
        {garage
          ? `funded by agent profit only · ${fmtMoney(garage.total)} earned to date`
          : 'progress placeholders — ledger unreachable'}
      </div>
    </div>
  );
}

function Funnel({ pipeline }: { pipeline: { scraped: number; sites: number; emailed: number; replied: number; closed: number } }) {
  const rows = [
    { k: 'scraped' as const, label: 'Leads scraped' },
    { k: 'sites'   as const, label: 'Sites built' },
    { k: 'emailed' as const, label: 'Emails sent' },
    { k: 'replied' as const, label: 'Replied' },
    { k: 'closed'  as const, label: 'Closed' },
  ];
  const max = pipeline.scraped || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '14px 16px 16px' }}>
      {rows.map((r) => {
        const val = pipeline[r.k];
        const w = Math.max(val > 0 ? 6 : 0, (val / max) * 100);
        return (
          <div key={r.k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span className="label" style={{ letterSpacing: '0.14em' }}>{r.label}</span>
              <span className="mono tnum" style={{ fontSize: 12, color: val > 0 ? 'var(--white)' : 'var(--txt-faint)' }}>{val}</span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: w + '%', borderRadius: 99,
                background: val > 0 ? CHROME_GRAD : 'transparent',
                boxShadow: val > 0 ? '0 0 8px rgba(226,228,236,0.3)' : 'none',
                transition: 'width 1.4s cubic-bezier(.2,.7,.3,1)',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LogFeed({ feed, height = 236 }: { feed: EventFeed; height?: number }) {
  const fmt = (iso: string) => new Date(iso).toTimeString().slice(0, 8);
  if (!feed.events.length) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', padding: '0 14px' }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--txt-faint)', textAlign: 'center', lineHeight: 1.6 }}>
          quiet — events appear as agents report,<br />the CEO delegates, and profit lands
        </span>
      </div>
    );
  }
  return (
    <div style={{ height, overflow: 'hidden', padding: '6px 14px 14px', maskImage: 'linear-gradient(180deg,#000 86%,transparent)', WebkitMaskImage: 'linear-gradient(180deg,#000 86%,transparent)' }}>
      {feed.events.map((l, i) => (
        <div key={l.ts + i} style={{
          display: 'flex', gap: 9, alignItems: 'baseline', padding: '4.5px 0',
          fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.35,
          opacity: i === 0 ? 1 : Math.max(0.35, 1 - i * 0.055),
          animation: i === 0 ? 'flickerIn 0.4s ease both' : 'none',
        }}>
          <span suppressHydrationWarning style={{ color: 'var(--txt-faint)', flexShrink: 0 }}>{fmt(l.ts)}</span>
          <span style={{
            color: l.sev === 'warn' ? 'var(--gold)' : l.sev === 'err' ? 'var(--err)' : 'var(--silver)', flexShrink: 0,
            textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.08em', width: 62, paddingTop: 1,
            opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{l.agentId}</span>
          <span style={{ color: SEV_COLOR[l.sev] === 'var(--silver)' ? 'var(--txt)' : SEV_COLOR[l.sev], flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</span>
        </div>
      ))}
    </div>
  );
}

function VizStrip({ growthStats, garage, feed }: { growthStats: GrowthStats | null; garage: GarageData | null; feed: EventFeed }) {
  const pipeline = {
    scraped: growthStats?.total ?? 0,
    sites:   growthStats?.sitesBuilt ?? 0,
    emailed: growthStats?.outreachSent ?? 0,
    replied: growthStats?.outreachReplied ?? 0,
    closed:  growthStats?.closed ?? 0,
  };
  return (
    <div id="pipeline" className="viz-strip">
      <section className="panel rise" style={{ animationDelay: '100ms' }}>
        <PanelHead title="The garage" right={
          garage
            ? <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--silver)' }}>{fmtMoney(garage.total)} earned</span>
            : <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>what it&rsquo;s for</span>
        } />
        <Garage garage={garage} />
      </section>
      <section className="panel rise" style={{ animationDelay: '160ms' }}>
        <PanelHead title="Growth pipeline" right={<span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>berkeley-biz</span>} />
        <Funnel pipeline={pipeline} />
      </section>
      <section className="panel rise" style={{ animationDelay: '220ms' }}>
        <PanelHead title="System log" right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><StatusDot color="#3fe08f" pulse size={6} /><span className="mono" style={{ fontSize: 10, color: 'var(--silver)' }}>live</span></span>} />
        <LogFeed feed={feed} />
      </section>
    </div>
  );
}

// ── agent card ────────────────────────────────────────────────
function MetricCell({ m }: { m: AgentMetric }) {
  let display: string;
  if (m.money) display = fmtMoney(m.value);
  else if (m.signed) display = (m.value >= 0 ? '+' : '') + m.value + (m.unit || '');
  else display = fmtNum(m.value) + (m.unit ? m.unit : '');
  const col = m.signed ? (m.value >= 0 ? 'var(--silver)' : 'var(--red)') : 'var(--white)';
  return (
    <div>
      <div className="mono tnum" style={{ fontSize: 17, color: col, lineHeight: 1.1 }}>{display}</div>
      <div className="label" style={{ fontSize: 9, marginTop: 3, letterSpacing: '0.12em' }}>{m.label}</div>
    </div>
  );
}

// eval layer — does the agent's output actually hold up
function QualityRow({ score, reliability, note }:
  { score?: number; reliability?: number; note?: string }) {
  if (score == null && reliability == null) return null;
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="label" style={{ letterSpacing: '0.14em' }}>output quality</span>
        <span style={{ display: 'inline-flex', gap: 9, alignItems: 'baseline' }}>
          {score != null && (
            <span className="mono tnum" style={{ fontSize: 13, color: qColor(score) }}>
              {Math.round(score * 100)}<span style={{ fontSize: 10, color: 'var(--txt-dim)' }}>%</span>
            </span>
          )}
          {reliability != null && (
            <span className="mono" style={{ fontSize: 10, color: 'var(--txt-mid)' }}>
              rel {Math.round(reliability * 100)}%
            </span>
          )}
        </span>
      </div>
      {score != null && <ProgressBar value={score} active={false} height={5} />}
      {note && (
        <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)', lineHeight: 1.4 }}>
          ⚖ {note}
        </span>
      )}
    </div>
  );
}

function AgentCard({ aw, idx, growthStats, jobStats, trend, queued, demo = false }: {
  aw: AgentWithStatus;
  idx: number;
  growthStats: GrowthStats | null;
  jobStats: JobStats | null;
  trend?: { points: number[]; delta: number | null };
  queued: number;
  demo?: boolean;
}) {
  const { agent, status } = aw;
  const cfg = AGENT_CFG[agent.id] ?? { uptime: null };
  const stateKey = status?.state ?? 'idle';
  const meta = STATE_META[stateKey] ?? STATE_META.idle;
  const active = status != null && status.state != null;
  const dead = !active;

  // self-reported metrics win; SQL-derived stats remain the fallback
  // until an agent's repo adopts the structured report fields
  let metrics: AgentMetric[] = [];
  if (status?.metrics?.length) {
    metrics = status.metrics.slice(0, 3);
  } else if (agent.id === 'growth' && growthStats) {
    metrics = [
      { label: 'Leads', value: growthStats.total },
      { label: 'Sites built', value: growthStats.sitesBuilt ?? 0 },
      { label: 'Emails', value: growthStats.outreachSent },
    ];
  } else if (agent.id === 'jobs' && jobStats && jobStats.discovered > 0) {
    metrics = [
      { label: 'Found', value: jobStats.discovered },
      { label: 'Applied', value: jobStats.submitted },
      { label: 'Interviews', value: jobStats.interviews },
    ];
  }

  const progress = status ? status.progress ?? hashProgress(agent.id + status.lastRun) : 0;
  const sparkData = active ? SPARKS[agent.id] ?? null : null;

  return (
    <div className={'panel rise' + (active ? ' edge' : '')} style={{
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      animationDelay: 80 + idx * 70 + 'ms',
      borderColor: active ? 'var(--line-2)' : 'var(--line)',
      boxShadow: active ? '0 18px 44px -30px rgba(225,228,238,0.25)' : 'none',
      opacity: dead ? 0.66 : 1,
    }}>
      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <Sigil id={agent.id} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--white)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{agent.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.ownerRepo}</div>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 2 }}>
            <StatusDot color={meta.color} pulse={active} size={7} />
            <span className="label" style={{ color: meta.color, fontSize: 9 }}>{meta.label}</span>
          </div>
        </div>

        {/* role */}
        <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--txt)', lineHeight: 1.45 }}>{agent.role}</p>

        {/* skills */}
        {agent.skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 11 }}>
            {agent.skills.map((s) => (
              <span key={s} className="mono" style={{
                fontSize: 9.5, padding: '2.5px 8px', borderRadius: 5,
                background: 'rgba(255,255,255,0.03)', color: 'var(--txt-mid)',
                border: '1px solid var(--line)', letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
              }}>{s}</span>
            ))}
          </div>
        )}

        {/* live task */}
        {status?.summary ? (
          <div style={{
            marginTop: 16, padding: '11px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--txt)', minWidth: 0 }}>
                <StatusDot color={meta.color} pulse={active} size={6} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status.summary}</span>
              </span>
              <span className="mono tnum" style={{ fontSize: 11, color: 'var(--silver)', flexShrink: 0 }}>
                {Math.round(progress * 100)}%
              </span>
            </div>
            <ProgressBar value={progress} active={active} />
          </div>
        ) : (
          <div style={{
            marginTop: 16, padding: '11px 12px', borderRadius: 10, textAlign: 'center',
            background: 'rgba(255,255,255,0.015)', border: '1px dashed var(--line-2)',
          }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--txt-dim)' }}>
              {cfg.note || (status ? `last run ${new Date(status.lastRun).toLocaleDateString()}` : 'no active task')}
            </span>
          </div>
        )}

        {/* delegated work waiting in the queue */}
        {queued > 0 && (
          <div className="mono" style={{ marginTop: 8, fontSize: 10, color: 'var(--txt-mid)', letterSpacing: '0.04em' }}>
            ◇ {queued} task{queued === 1 ? '' : 's'} queued from the CEO
          </div>
        )}

        {/* output quality (eval layer) */}
        <QualityRow
          score={status?.evalScore}
          reliability={status?.evalReliability}
          note={status?.evalSummary}
        />

        {/* quality trend from eval_runs history */}
        {trend && trend.points.length >= 2 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="label" style={{ letterSpacing: '0.14em' }}>
              quality trend
              {trend.delta != null && (
                <span style={{ marginLeft: 8, color: trend.delta >= 0 ? 'var(--ok)' : 'var(--err)' }}>
                  {trend.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(trend.delta * 100))}%
                </span>
              )}
            </span>
            <Sparkline data={trend.points} width={108} height={28} />
          </div>
        )}

        {/* metrics + sparkline */}
        {metrics.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 18 }}>
              {metrics.map((m) => <MetricCell key={m.label} m={m} />)}
            </div>
            {sparkData && <Sparkline data={sparkData} />}
          </div>
        ) : sparkData ? (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Sparkline data={sparkData} width={120} />
          </div>
        ) : null}

        {/* footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 'auto', paddingTop: 14,
        }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>
            {cfg.uptime != null && <span style={{ color: 'var(--txt-dim)' }}>{cfg.uptime}% uptime · </span>}
            {agent.schedule}
          </div>
          {cfg.link && !demo
            ? <a href={cfg.link.href} className="mono" style={{ fontSize: 10.5, color: 'var(--silver)' }}>{cfg.link.label} →</a>
            : cfg.note && active ? <span className="mono" style={{ fontSize: 10, color: 'var(--gold)' }}>{cfg.note}</span> : null}
        </div>
      </div>
    </div>
  );
}

// ── delegations — what the CEO has handed to the fleet ────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TASK_META: Record<string, { color: string; label: string; pulse?: boolean; dim?: boolean }> = {
  queued:      { color: 'var(--silver)', label: 'queued' },
  in_progress: { color: '#3fe08f',       label: 'in progress', pulse: true },
  done:        { color: '#3fe08f',       label: 'done', dim: true },
  dropped:     { color: 'var(--txt-faint)', label: 'dropped', dim: true },
};

function Delegations({ tasks, nameFor }: { tasks: FleetTask[]; nameFor: (id: string) => string }) {
  const open = tasks.filter((t) => t.status === 'queued' || t.status === 'in_progress').length;
  return (
    <section className="panel rise" style={{ marginTop: 20, animationDelay: '80ms' }}>
      <PanelHead
        title="Delegations"
        right={
          tasks.length > 0
            ? <span className="mono tnum" style={{ fontSize: 10, color: open > 0 ? 'var(--silver)' : 'var(--txt-faint)' }}>{open} open</span>
            : <a href="/ceo" className="mono" style={{ fontSize: 10.5, color: 'var(--silver)' }}>ask the CEO →</a>
        }
      />
      {tasks.length === 0 ? (
        <div style={{ padding: '16px 16px 20px', textAlign: 'center' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--txt-dim)' }}>
            nothing delegated yet — hand the CEO some work and it lands here
          </span>
        </div>
      ) : (
        <div style={{ padding: '4px 16px 10px' }}>
          {tasks.map((t, i) => {
            const tm = TASK_META[t.status] ?? TASK_META.queued;
            return (
              <div key={t.id} title={t.spec} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
                borderBottom: i < tasks.length - 1 ? '1px solid var(--line)' : 'none',
                opacity: tm.dim ? 0.55 : 1,
              }}>
                <Sigil id={t.agentId} size={20} />
                <span style={{ fontSize: 12.5, color: 'var(--white)', width: 100, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {nameFor(t.agentId)}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--txt)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.title}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <StatusDot color={tm.color} pulse={tm.pulse} size={6} />
                  <span className="label" style={{ color: tm.color, fontSize: 9 }}>{tm.label}</span>
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)', width: 64, textAlign: 'right', flexShrink: 0 }} suppressHydrationWarning>
                  {relativeTime(t.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── fleet quality (consolidated eval panel) ───────────────────
function FleetQuality({ fleet, trends }: {
  fleet: AgentWithStatus[];
  trends: Record<string, { points: number[]; delta: number | null }>;
}) {
  const scored = fleet.filter((a) => a.status?.evalScore != null);
  const avg = scored.length
    ? scored.reduce((acc, a) => acc + (a.status!.evalScore as number), 0) / scored.length
    : null;
  const rows = fleet.filter(
    (a) => a.status?.evalScore != null || (trends[a.agent.id]?.points?.length ?? 0) >= 2
  );
  if (rows.length === 0) return null;

  return (
    <section className="panel rise" style={{ marginTop: 20, animationDelay: '120ms' }}>
      <PanelHead
        title="Fleet quality"
        right={
          avg != null
            ? <span className="mono tnum" style={{ fontSize: 12, color: qColor(avg) }}>avg {Math.round(avg * 100)}%</span>
            : <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>awaiting first scores</span>
        }
      />
      <div style={{ padding: '4px 16px 12px' }}>
        {rows.map((aw, i) => {
          const score = aw.status?.evalScore ?? null;
          const rel = aw.status?.evalReliability ?? null;
          const tr = trends[aw.agent.id];
          return (
            <div key={aw.agent.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
              borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none',
            }}>
              <Sigil id={aw.agent.id} size={20} />
              <span style={{ fontSize: 12.5, color: 'var(--white)', width: 100, flexShrink: 0 }}>{aw.agent.name}</span>
              <span className="mono tnum" style={{
                fontSize: 14, width: 46, flexShrink: 0,
                color: score != null ? qColor(score) : 'var(--txt-faint)',
              }}>
                {score != null ? Math.round(score * 100) + '%' : '—'}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--txt-mid)', width: 56, flexShrink: 0 }}>
                {rel != null ? 'rel ' + Math.round(rel * 100) + '%' : ''}
              </span>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                {tr?.delta != null && (
                  <span className="mono" style={{ fontSize: 10, color: tr.delta >= 0 ? 'var(--ok)' : 'var(--err)' }}>
                    {tr.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(tr.delta * 100))}%
                  </span>
                )}
                {tr && tr.points.length >= 2 && (
                  <Sparkline data={tr.points} width={120} height={26} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── trading eval loop (dedicated finance panel) ───────────────
function TradingEvalCard({ fleet }: { fleet: AgentWithStatus[] }) {
  const fin = fleet.find((a) => a.agent.id === 'finance');
  const s = fin?.status;
  if (!s || s.evalScore == null) return null;

  const m = (s.evalSummary || '').match(/^\[([^\]]+)\]\s*/);
  const tag = m ? m[1] : '';
  const rationale = m ? (s.evalSummary as string).slice(m[0].length) : (s.evalSummary || '');
  const independent = /cross-family judge/i.test(tag);
  const judgeModel = independent ? tag.replace(/cross-family judge:\s*/i, '') : null;
  const score = s.evalScore as number;
  const badgeColor = independent ? '#3fe08f' : '#f2c14e';

  return (
    <section className="panel rise" style={{ marginTop: 16, animationDelay: '180ms' }}>
      <PanelHead
        title="Finance — eval loop"
        right={<span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>ai-trading-bot</span>}
      />
      <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, color: 'var(--txt)', lineHeight: 1.5 }}>{s.summary}</div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, flexWrap: 'wrap' }}>
          <div>
            <div className="label">Recap quality</div>
            <div className="mono tnum" style={{ fontSize: 32, color: qColor(score), lineHeight: 1, marginTop: 4 }}>
              {Math.round(score * 100)}<span style={{ fontSize: 14, color: 'var(--txt-dim)' }}>%</span>
            </div>
          </div>
          <div>
            <div className="label">Prediction reliability</div>
            <div className="mono tnum" style={{
              fontSize: 32, lineHeight: 1, marginTop: 4,
              color: s.evalReliability != null ? qColor(s.evalReliability) : 'var(--txt-faint)',
            }}>
              {s.evalReliability != null ? Math.round(s.evalReliability * 100) + '%' : '—'}
            </div>
            {s.evalReliability == null && (
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', marginTop: 3 }}>building history</div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <span className="mono" style={{
              fontSize: 10, padding: '4px 10px', borderRadius: 99,
              border: `1px solid ${badgeColor}44`, color: badgeColor, background: `${badgeColor}11`,
            }}>
              {independent ? `independently judged · ${judgeModel}` : 'self-judged (provisional)'}
            </span>
          </div>
        </div>

        {rationale && (
          <div style={{
            fontSize: 11.5, color: 'var(--txt-mid)', lineHeight: 1.5, fontStyle: 'italic',
            borderLeft: '2px solid var(--line-2)', paddingLeft: 11,
          }}>
            ⚖ {rationale}
          </div>
        )}

        <div className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>
          {s.lastRun ? `last run ${new Date(s.lastRun).toLocaleString()} · ` : ''}grounded on real prices (yfinance)
        </div>
      </div>
    </section>
  );
}

// ── company brain card ───────────────────────────────────────
const BRAIN_DOMAIN_COLORS: Record<string, string> = {
  finance:      '#3fe08f',
  social:       '#6fa3f7',
  'client-ops': '#f2c14e',
  garage:       '#e06f3f',
  internal:     '#c9ccd6',
};

function CompanyBrainCard() {
  const [skills, setSkills] = useState<{ domain: string; name: string; title: string; escalate: boolean; usage_count: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/brain')
      .then((r) => r.json())
      .then((d) => { setSkills(d.skills ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const domains = ['finance', 'social', 'client-ops', 'garage', 'internal'];
  const byDomain = Object.fromEntries(domains.map((d) => [d, skills.filter((s) => s.domain === d).length]));
  const total = skills.length;
  const maxCount = Math.max(1, ...Object.values(byDomain));

  return (
    <section className="panel rise" style={{ marginTop: 20, animationDelay: '200ms' }}>
      <PanelHead
        title="Company Brain"
        right={
          loaded
            ? <a href="/brain" className="mono" style={{ fontSize: 10.5, color: 'var(--silver)' }}>{total} skills →</a>
            : <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>loading…</span>
        }
      />
      <div style={{ padding: '12px 16px 16px' }}>
        {!loaded ? (
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--txt-faint)' }}>reading the brain…</span>
        ) : total === 0 ? (
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--txt-faint)' }}>
            no skills yet — <a href="/brain" style={{ color: 'var(--silver)' }}>open the brain →</a>
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {domains.map((d) => {
              const count = byDomain[d];
              const color = BRAIN_DOMAIN_COLORS[d] ?? 'var(--silver)';
              const pct = count / maxCount;
              return (
                <div key={d}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span className="label" style={{ letterSpacing: '0.12em', fontSize: 9, color: 'var(--txt-faint)' }}>
                      {d.toUpperCase()}
                    </span>
                    <span className="mono tnum" style={{ fontSize: 10, color: count > 0 ? color : 'var(--txt-faint)' }}>
                      {count}
                    </span>
                  </div>
                  <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.05)' }}>
                    {count > 0 && (
                      <div style={{
                        height: '100%', width: `${Math.round(pct * 100)}%`, borderRadius: 99,
                        background: color, opacity: 0.75,
                        transition: 'width 1s cubic-bezier(.2,.7,.3,1)',
                      }} />
                    )}
                  </div>
                </div>
              );
            })}
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', marginTop: 4 }}>
              {skills.filter((s) => s.escalate).length} require Charles · {skills.filter((s) => !s.escalate).length} autonomous
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── pixel M4 — drives across the garage floor ─────────────────
// pixel-bmw-t.png is the flood-filled true-transparency cut: screen
// blending breaks inside this animated wrapper, so the asset itself
// carries the transparency. Keep image-rendering: pixelated.
function PixelM4() {
  return (
    <div style={{ position: 'relative', height: 96, overflow: 'hidden', margin: '34px 0 0' }}>
      {/* road */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 18, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(220,223,232,0.22) 18%, rgba(220,223,232,0.22) 82%, transparent)',
      }} />
      {/* car: outer = drive across, inner = pixel bob, img cropped from square ref */}
      <div style={{
        position: 'absolute', bottom: 14, left: 0,
        animation: 'drive 32s linear infinite',
        willChange: 'transform',
      }}>
        <div style={{ animation: 'bob 0.5s steps(2, jump-none) infinite' }}>
          <div style={{ width: 170, height: 66, overflow: 'hidden', position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/pixel-bmw-t.png" alt="pixel BMW M4" style={{
              width: 230, height: 230, objectFit: 'cover', display: 'block',
              marginLeft: -30, marginTop: -80,
              imageRendering: 'pixelated',
            }} />
          </div>
          {/* headlight beam (car faces left) */}
          <div style={{
            position: 'absolute', left: -54, bottom: 14, width: 60, height: 10,
            background: 'linear-gradient(270deg, rgba(244,245,248,0.35), transparent 85%)',
            borderRadius: 99, filter: 'blur(1px)',
          }} />
        </div>
      </div>
      <div className="mono" style={{
        position: 'absolute', right: 2, bottom: 0, fontSize: 9.5,
        letterSpacing: '0.2em', color: 'var(--txt-faint)', textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>m4 competition · en route</div>
    </div>
  );
}

// ── main export ───────────────────────────────────────────────
const REFRESH_MS = 15_000;

export function FleetDashboard({ initial, growthStats, jobStats, garage, initialTasks, initialEvents, demo = false }: {
  initial: AgentWithStatus[];
  growthStats: GrowthStats | null;
  jobStats: JobStats | null;
  garage: GarageData | null;
  initialTasks: FleetTask[];
  initialEvents: EventFeed;
  demo?: boolean;
}) {
  const [fleet, setFleet] = useState(initial);
  const [tasks, setTasks] = useState(initialTasks);
  const [feed, setFeed] = useState(initialEvents);
  const [trends, setTrends] = useState<Record<string, { points: number[]; delta: number | null }>>({});

  useEffect(() => {
    if (demo) return; // public demo runs on a static snapshot — no gated polling
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/agents');
        if (res.ok) setFleet(await res.json());
      } catch { /* transient — next tick retries */ }
      try {
        const res = await fetch('/api/tasks');
        if (res.ok) setTasks((await res.json()).tasks ?? []);
      } catch { /* transient — next tick retries */ }
      try {
        const res = await fetch('/api/events');
        if (res.ok) setFeed(await res.json());
      } catch { /* transient — next tick retries */ }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (demo) return; // trends come from a gated endpoint; demo ships seeded ones
    const load = async () => {
      try {
        const res = await fetch('/api/trends');
        if (!res.ok) return;
        const arr: { agentId: string; points: number[]; delta: number | null }[] = await res.json();
        const map: Record<string, { points: number[]; delta: number | null }> = {};
        for (const t of arr) map[t.agentId] = { points: t.points, delta: t.delta };
        setTrends(map);
      } catch { /* trends are decorative; ignore fetch errors */ }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const online = fleet.filter((a) => a.status?.state != null).length;
  const needEye = fleet.filter((a) => a.status?.state === 'warn' || a.status?.state === 'error').length;
  const queuedByAgent: Record<string, number> = {};
  for (const t of tasks) {
    if (t.status === 'queued') queuedByAgent[t.agentId] = (queuedByAgent[t.agentId] ?? 0) + 1;
  }
  const nameFor = (id: string) => fleet.find((a) => a.agent.id === id)?.agent.name ?? id;

  return (
    <div className="page" style={{ maxWidth: 1320, margin: '0 auto' }}>
      <Header online={online} needEye={needEye} />
      <Nav active="Fleet" demo={demo} />
      <Hero fleet={fleet} feed={feed} />
      <VizStrip growthStats={growthStats} garage={garage} feed={feed} />

      {/* agent grid */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--txt-mid)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          The fleet
        </h2>
        <span className="label">{fleet.length} units · {demo ? 'demo snapshot' : `auto-refresh ${REFRESH_MS / 1000}s`}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))', gap: 16 }}>
        {fleet.map((aw, i) => (
          <AgentCard key={aw.agent.id} aw={aw} idx={i} demo={demo}
            growthStats={growthStats} jobStats={jobStats} trend={trends[aw.agent.id]}
            queued={queuedByAgent[aw.agent.id] ?? 0} />
        ))}
      </div>

      <Delegations tasks={tasks} nameFor={nameFor} />
      <FleetQuality fleet={fleet} trends={trends} />
      <TradingEvalCard fleet={fleet} />
      {!demo && <CompanyBrainCard />}

      <PixelM4 />
      <p className="mono" style={{ fontSize: 11, color: 'var(--txt-faint)', margin: '18px 0 0', textAlign: 'center' }}>
        CEO OS · Charles&rsquo; hub · built for the long game
      </p>
    </div>
  );
}
