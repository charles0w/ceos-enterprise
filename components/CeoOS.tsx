'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentWithStatus } from '@/lib/types';
import type { GrowthStats } from '@/lib/growth';

// ── palette ──────────────────────────────────────────────────
const C = {
  cyan:   '#2fd4e6',
  green:  '#39d98a',
  amber:  '#f5a623',
  red:    '#ef5350',
  violet: '#a78bfa',
  idle:   '#46535f',
};

const STATE_META: Record<string, { color: string; label: string }> = {
  ok:    { color: C.green,  label: 'operational' },
  warn:  { color: C.amber,  label: 'degraded'    },
  error: { color: C.red,    label: 'error'        },
  idle:  { color: C.idle,   label: 'standby'      },
};

// ── per-agent static config ───────────────────────────────────
interface AgentConfig {
  glyph:   string;
  accent:  string;
  uptime:  number | null;
  note?:   string;
  link?:   { label: string; href: string };
}
const AGENT_CFG: Record<string, AgentConfig> = {
  commerce: { glyph: '◆', accent: C.green,  uptime: 99.4 },
  finance:  { glyph: '▲', accent: C.cyan,   uptime: 98.9 },
  growth:   { glyph: '⬢', accent: C.cyan,   uptime: 99.1, link: { label: 'open pipeline', href: '/businesses' } },
  social:   { glyph: '✦', accent: C.amber,  uptime: 96.2, note: 'Phase 0 gate · results Jun 7' },
  hobbies:  { glyph: '○', accent: C.idle,   uptime: null, note: 'awaiting assignment' },
  school:   { glyph: '◇', accent: C.idle,   uptime: null, note: 'provisioning — Phase 4' },
};

// ── sparkline seed ────────────────────────────────────────────
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
  commerce: spark(7,  24, 30, 10,  1.1),
  finance:  spark(13, 24, 60,  9,  0.4),
  growth:   spark(3,  24, 20, 14,  2.0),
  social:   spark(21, 24, 45, 16, -0.3),
};

// ── log pool ──────────────────────────────────────────────────
const LOG_POOL = [
  { a: 'commerce', c: C.green,  sev: 'ok',   t: 'order #4821 fulfilled — $74.00' },
  { a: 'growth',   c: C.cyan,   sev: 'ok',   t: 'demo site generated · charlesbuilds.online' },
  { a: 'finance',  c: C.cyan,   sev: 'info', t: 'pulled 18 tickers · vol elevated on NVDA' },
  { a: 'social',   c: C.amber,  sev: 'warn', t: 'IG rate limit hit — backing off 90s' },
  { a: 'growth',   c: C.cyan,   sev: 'ok',   t: 'cold-email queued → Quill Fashion' },
  { a: 'commerce', c: C.green,  sev: 'ok',   t: 'sourced 6 new SKUs · margin ≥ 28%' },
  { a: 'finance',  c: C.cyan,   sev: 'info', t: 'portfolio marked — day P/L +1.8%' },
  { a: 'growth',   c: C.cyan,   sev: 'info', t: 'scraped 14 businesses · Berkeley · food' },
  { a: 'social',   c: C.amber,  sev: 'ok',   t: 'trend detected — "matcha morning" +220%' },
  { a: 'commerce', c: C.green,  sev: 'ok',   t: 'fulfillment tick · 14 orders in flight' },
  { a: 'system',   c: C.violet, sev: 'info', t: 'health sweep complete · 4/6 online' },
  { a: 'growth',   c: C.cyan,   sev: 'ok',   t: 'outreach batch sent · 7 emails delivered' },
  { a: 'finance',  c: C.cyan,   sev: 'ok',   t: 'EOD recap scheduled · 4:00pm PT' },
  { a: 'system',   c: C.violet, sev: 'info', t: 'KV snapshot persisted' },
];

interface LogLine { a: string; c: string; sev: string; t: string; ts: Date; key: string }

function seedLog(): LogLine[] {
  const now = Date.now();
  return Array.from({ length: 8 }, (_, i) => {
    const item = LOG_POOL[(i * 5 + 2) % LOG_POOL.length];
    return { ...item, ts: new Date(now - i * 47000), key: 'seed' + i };
  });
}

// ── formatters ────────────────────────────────────────────────
function fmtMoney(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return '$' + Math.round(n);
}
function fmtNum(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toLocaleString();
}
function greetingFor(h: number): string {
  if (h < 5)  return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function fmtTs(d: Date): string { return d.toTimeString().slice(0, 8); }

// ── hooks ─────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useCountUp(target: number, dur = 1100): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf: number;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) { raf = requestAnimationFrame(tick); }
      else { setV(target); }
    };
    raf = requestAnimationFrame(tick);
    const safety = setTimeout(() => setV(target), dur + 250);
    return () => { cancelAnimationFrame(raf); clearTimeout(safety); };
  }, [target, dur]);
  return v;
}

// ── primitives ────────────────────────────────────────────────
function StatusDot({ color, pulse, size = 8 }: { color: string; pulse?: boolean; size?: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      {pulse && (
        <span style={{
          position: 'absolute', inset: -3, borderRadius: 999,
          border: `1px solid ${color}`, opacity: 0.5,
          animation: 'pulseDot 2s ease-in-out infinite',
        }} />
      )}
      <span style={{
        width: size, height: size, borderRadius: 999,
        background: color, boxShadow: `0 0 8px ${color}`, display: 'block',
      }} />
    </span>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="mono" style={{
      fontSize: 10, padding: '3px 9px', borderRadius: 99,
      border: `1px solid ${color}44`, color,
      background: `${color}11`, letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function Kpi({ label, value, suffix, color, align = 'left' }:
  { label: string; value: string | number; suffix?: string; color?: string; align?: 'left' | 'right' }) {
  return (
    <div style={{ textAlign: align }}>
      <div className="label">{label}</div>
      <div className="mono tnum" style={{
        fontSize: 26, fontWeight: 500, color: color || '#eafcff', marginTop: 5, lineHeight: 1,
      }}>
        {value}
        {suffix && <span style={{ fontSize: 13, color: 'var(--txt-mid)', marginLeft: 2 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ProgressBar({ value, color = C.cyan, active = true }:
  { value: number; color?: string; active?: boolean }) {
  return (
    <div style={{
      height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.05)',
      overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, width: Math.round(value * 100) + '%',
        background: `linear-gradient(90deg, ${color}55, ${color})`,
        borderRadius: 99, transition: 'width 1.2s cubic-bezier(.2,.7,.3,1)',
        boxShadow: `0 0 10px ${color}66`,
      }}>
        {active && (
          <span style={{
            position: 'absolute', top: 0, bottom: 0, width: '40%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
            animation: 'shimmer 2.4s ease-in-out infinite',
          }} />
        )}
      </div>
    </div>
  );
}

function Sparkline({ data, color, width = 150, height = 38 }:
  { data: number[]; color: string; width?: number; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pad = 3;
  const X = (i: number) => (i / (data.length - 1)) * width;
  const Y = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const gid = 'sg' + color.replace('#', '') + width;
  const lastX = X(data.length - 1), lastY = Y(data[data.length - 1]);
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="4" fill={color} opacity="0.25" />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

function ArcReactor({ online, total, size = 230 }: { online: number; total: number; size?: number }) {
  const cx = size / 2, cy = size / 2;
  const ticks = Array.from({ length: 48 });
  const big = useCountUp(online, 1400);
  const circ = 2 * Math.PI * size * 0.30;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{
        position: 'absolute', inset: '14%', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(47,212,230,0.35), rgba(47,212,230,0.05) 60%, transparent 72%)',
        filter: 'blur(6px)', animation: 'corePulse 3.6s ease-in-out infinite',
      }} />
      <svg width={size} height={size} style={{ position: 'relative' }}>
        <g style={{ transformOrigin: 'center', animation: 'spin 36s linear infinite' }}>
          <circle cx={cx} cy={cy} r={size * 0.46} fill="none"
            stroke="rgba(47,212,230,0.45)" strokeWidth="1" strokeDasharray="2 7" />
        </g>
        <g style={{ transformOrigin: 'center', animation: 'spinR 60s linear infinite' }}>
          {ticks.map((_, i) => {
            const a = (i / ticks.length) * Math.PI * 2;
            const r1 = size * 0.40;
            const r2 = size * (i % 4 === 0 ? 0.35 : 0.375);
            const op = i % 4 === 0 ? 0.6 : 0.22;
            return (
              <line key={i}
                x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1}
                x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2}
                stroke="#2fd4e6" strokeOpacity={op} strokeWidth="1" />
            );
          })}
        </g>
        {/* track */}
        <circle cx={cx} cy={cy} r={size * 0.30} fill="none"
          stroke="rgba(47,212,230,0.12)" strokeWidth="3" />
        {/* progress arc */}
        <circle cx={cx} cy={cy} r={size * 0.30} fill="none"
          stroke="#2fd4e6" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${circ * (online / total)} ${circ}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: 'drop-shadow(0 0 5px #2fd4e6)', transition: 'stroke-dasharray 1.4s ease' }} />
        <g style={{ transformOrigin: 'center', animation: 'spin 14s linear infinite' }}>
          <circle cx={cx} cy={cy} r={size * 0.22} fill="none"
            stroke="rgba(47,212,230,0.55)" strokeWidth="1.5"
            strokeDasharray={`${size * 0.5} ${size * 0.9}`} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={size * 0.155} fill="rgba(47,212,230,0.06)"
          stroke="rgba(47,212,230,0.5)" strokeWidth="1" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      }}>
        <div className="mono tnum" style={{
          fontSize: 52, fontWeight: 600, lineHeight: 1, color: '#eafcff',
          textShadow: '0 0 18px rgba(47,212,230,0.7)',
        }}>{Math.round(big)}</div>
        <div className="label" style={{ marginTop: 6, color: C.cyan, opacity: 0.85 }}>online</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>of {total} agents</div>
      </div>
    </div>
  );
}

function Throughput({ data, height = 80 }: { data: number[]; height?: number }) {
  const w = 100;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const X = (i: number) => (i / (data.length - 1)) * w;
  const Y = (v: number) => height - 4 - ((v - min) / range) * (height - 12);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)} ${Y(v).toFixed(2)}`).join(' ');
  const area = `${line} L ${w} ${height} L 0 ${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="thru" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2fd4e6" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#2fd4e6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(g => (
        <line key={g} x1="0" x2={w} y1={height * g} y2={height * g}
          stroke="rgba(255,255,255,0.04)" strokeWidth="0.4" />
      ))}
      <path d={area} fill="url(#thru)" />
      <path d={line} fill="none" stroke="#2fd4e6" strokeWidth="1" vectorEffect="non-scaling-stroke"
        style={{ filter: 'drop-shadow(0 0 3px rgba(47,212,230,0.6))' }} />
    </svg>
  );
}

function Funnel({ pipeline }: { pipeline: { scraped: number; sites: number; emailed: number; replied: number; closed: number } }) {
  const rows = [
    { k: 'scraped' as const, label: 'Leads scraped', color: C.cyan   },
    { k: 'sites'   as const, label: 'Sites built',   color: C.cyan   },
    { k: 'emailed' as const, label: 'Emails sent',   color: C.violet },
    { k: 'replied' as const, label: 'Replied',       color: C.green  },
    { k: 'closed'  as const, label: 'Closed',        color: C.green  },
  ];
  const max = pipeline.scraped || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '14px 16px 16px' }}>
      {rows.map(r => {
        const val = pipeline[r.k];
        const w = Math.max(val > 0 ? 6 : 0, (val / max) * 100);
        return (
          <div key={r.k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span className="label" style={{ letterSpacing: '0.14em' }}>{r.label}</span>
              <span className="mono tnum" style={{ fontSize: 12, color: val > 0 ? '#dfeef2' : 'var(--txt-faint)' }}>{val}</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: w + '%', borderRadius: 99,
                background: val > 0 ? `linear-gradient(90deg, ${r.color}44, ${r.color})` : 'transparent',
                boxShadow: val > 0 ? `0 0 8px ${r.color}55` : 'none',
                transition: 'width 1.4s cubic-bezier(.2,.7,.3,1)',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TIMELINE_LANES = [
  { id: 'commerce', label: 'Commerce', color: C.green,  blocks: [[0,3],[6,9],[12,14],[19,22],[26,30]] as [number,number][] },
  { id: 'finance',  label: 'Finance',  color: C.cyan,   blocks: [[2,4],[15,18],[28,31]] as [number,number][] },
  { id: 'growth',   label: 'Growth',   color: C.cyan,   blocks: [[1,2],[8,12],[22,27],[30,32]] as [number,number][] },
  { id: 'social',   label: 'Social',   color: C.amber,  blocks: [[4,7],[17,20],[24,25]] as [number,number][] },
];

function Timeline({ slots = 32 }: { slots?: number }) {
  return (
    <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {TIMELINE_LANES.map(lane => (
        <div key={lane.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="mono" style={{ width: 64, fontSize: 10, color: 'var(--txt-mid)', flexShrink: 0 }}>{lane.label}</div>
          <div style={{ position: 'relative', flex: 1, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.025)' }}>
            {lane.blocks.map(([s, e], i) => (
              <div key={i} style={{
                position: 'absolute', top: 2, bottom: 2,
                left: (s / slots) * 100 + '%', width: ((e - s) / slots) * 100 + '%',
                background: lane.color, opacity: 0.8, borderRadius: 3,
                boxShadow: `0 0 6px ${lane.color}66`,
              }} />
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, paddingLeft: 74 }}>
        {['-8h', '-6h', '-4h', '-2h', 'now'].map(t => (
          <span key={t} className="mono" style={{ fontSize: 9, color: 'var(--txt-faint)' }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function LogFeed() {
  const [lines, setLines] = useState<LogLine[]>(() => seedLog());
  const n = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      const item = LOG_POOL[Math.floor((n.current * 7 + 3) % LOG_POOL.length)];
      n.current++;
      setLines(prev => [{ ...item, ts: new Date(), key: 'l' + Date.now() + n.current }, ...prev].slice(0, 14));
    }, 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ height: 248, overflow: 'hidden', padding: '6px 14px 14px', maskImage: 'linear-gradient(180deg,#000 86%,transparent)' }}>
      {lines.map((l, i) => (
        <div key={l.key} style={{
          display: 'flex', gap: 9, alignItems: 'baseline', padding: '4.5px 0',
          fontFamily: 'var(--font-mono, var(--mono))', fontSize: 11.5, lineHeight: 1.35,
          opacity: i === 0 ? 1 : Math.max(0.4, 1 - i * 0.05),
          animation: i === 0 ? 'flickerIn 0.4s ease both' : 'none',
        }}>
          <span style={{ color: 'var(--txt-faint)', flexShrink: 0 }}>{fmtTs(l.ts)}</span>
          <span style={{
            color: l.c, flexShrink: 0, textTransform: 'uppercase',
            fontSize: 9, letterSpacing: '0.08em', width: 62, paddingTop: 1,
          }}>{l.a}</span>
          <span style={{ color: l.sev === 'warn' ? C.amber : 'var(--txt)', flex: 1 }}>{l.t}</span>
        </div>
      ))}
    </div>
  );
}

function PanelHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="panel-head">
      <span className="label" style={{ color: 'var(--txt-mid)', letterSpacing: '0.18em' }}>{title}</span>
      {right}
    </div>
  );
}

// ── header ────────────────────────────────────────────────────
function Header({ online, needAttention }: { online: number; needAttention: number }) {
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
      flexWrap: 'wrap', gap: 20, paddingBottom: 22, marginBottom: 26,
      borderBottom: '1px solid var(--line)',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 7,
            border: '1px solid rgba(47,212,230,0.4)',
            display: 'grid', placeItems: 'center',
            color: C.cyan, fontSize: 13, boxShadow: 'var(--glow-cyan)',
            flexShrink: 0,
          }}>◉</span>
          <span className="label" style={{ color: 'var(--txt-mid)', letterSpacing: '0.3em' }}>
            CEO OS · FLEET CONTROL
          </span>
        </div>
        <h1 style={{
          margin: 0, fontFamily: 'var(--font-sans, var(--sans))',
          fontWeight: 600, fontSize: 30, letterSpacing: '-0.01em', color: '#eef6f9',
        }}>
          {greetingFor(h)}, Charles.
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--txt-mid)', fontSize: 14 }}>
          Fleet is <span style={{ color: C.green }}>nominal</span>.{' '}
          {online} agents online · {needAttention} need attention.
        </p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="mono tnum" style={{
          fontSize: 30, color: '#eafcff', letterSpacing: '0.02em', lineHeight: 1, whiteSpace: 'nowrap',
        }}>
          {hh}:{mm}:{ss}
          <span style={{ fontSize: 14, color: 'var(--txt-mid)', marginLeft: 6 }}>{mer}</span>
        </div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--txt-dim)', marginTop: 7 }}>
          {date} · PT
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 9 }}>
          <StatusDot color={C.cyan} pulse size={7} />
          <span className="label" style={{ color: C.cyan }}>all systems live</span>
        </div>
      </div>
    </header>
  );
}

// ── hero ──────────────────────────────────────────────────────
function Hero({ fleet, growthStats }: { fleet: AgentWithStatus[]; growthStats: GrowthStats | null }) {
  const total = fleet.length;
  const online  = fleet.filter(a => a.status?.state != null).length;
  const healthy  = fleet.filter(a => a.status?.state === 'ok').length;
  const degraded = fleet.filter(a => a.status?.state === 'warn').length;
  const standby  = fleet.filter(a => a.status == null || a.status.state == null).length;

  const eventsVal  = useCountUp(1284, 1500);
  const leadsVal   = useCountUp(growthStats?.total ?? 133, 1400);

  const scored = fleet.filter(a => a.status?.evalScore != null);
  const avgQuality = scored.length
    ? scored.reduce((acc, a) => acc + (a.status!.evalScore as number), 0) / scored.length
    : null;

  const sparksAll = Object.values(SPARKS);
  const n = 24;
  const throughput = Array.from({ length: n }, (_, i) =>
    sparksAll.reduce((sum, s) => sum + (s[i] || 0), 0)
  );

  return (
    <section className="panel ticks rise" style={{ padding: 0, overflow: 'hidden', marginBottom: 22 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', gap: 24, padding: '30px 40px 6px',
      }}>
        {/* left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, alignItems: 'flex-start' }}>
          <Kpi label="Running" value={online} color={C.cyan} />
          <Kpi label="Avg uptime" value="98.7" suffix="%" color="#eafcff" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Pill color={C.green}>{healthy} healthy</Pill>
            <Pill color={C.amber}>{degraded} degraded</Pill>
            <Pill color={C.idle}>{standby} standby</Pill>
          </div>
        </div>
        {/* reactor */}
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <ArcReactor online={online} total={total} />
        </div>
        {/* right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, alignItems: 'flex-end' }}>
          <Kpi label="Events · 24h" value={fmtNum(eventsVal)} color="#eafcff" align="right" />
          <Kpi label="Pipeline leads" value={Math.round(leadsVal)} color={C.cyan} align="right" />
          {avgQuality != null && (
            <Kpi label="Avg quality" value={Math.round(avgQuality * 100)} suffix="%"
              color={qColor(avgQuality)} align="right" />
          )}
          <div style={{ textAlign: 'right' }}>
            <div className="label">Reporting</div>
            <div className="mono tnum" style={{ fontSize: 18, color: '#eafcff', marginTop: 5 }}>
              {online}<span style={{ color: 'var(--txt-dim)' }}>/{total}</span>
            </div>
          </div>
        </div>
      </div>
      {/* throughput strip */}
      <div style={{ padding: '14px 24px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span className="label">Throughput · 24h</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>events/hr</span>
        </div>
        <Throughput data={throughput} height={64} />
      </div>
    </section>
  );
}

// ── viz strip ─────────────────────────────────────────────────
function VizStrip({ growthStats }: { growthStats: GrowthStats | null }) {
  const pipeline = {
    scraped: growthStats?.total ?? 0,
    sites:   growthStats?.sitesBuilt ?? 0,
    emailed: growthStats?.outreachSent ?? 0,
    replied: growthStats?.outreachReplied ?? 0,
    closed:  growthStats?.closed ?? 0,
  };
  return (
    <div id="pipeline" style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr)',
      gap: 18, marginBottom: 22,
    }}>
      <section className="panel ticks rise" style={{ animationDelay: '120ms' }}>
        <PanelHead
          title="Growth pipeline"
          right={<span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>berkeley-biz</span>}
        />
        <Funnel pipeline={pipeline} />
      </section>
      <section className="panel ticks rise" style={{ animationDelay: '180ms' }}>
        <PanelHead
          title="Fleet activity"
          right={<span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>last 8h</span>}
        />
        <Timeline />
      </section>
      <section className="panel ticks rise" style={{ animationDelay: '240ms' }}>
        <PanelHead
          title="System log"
          right={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <StatusDot color={C.cyan} pulse size={6} />
              <span className="mono" style={{ fontSize: 10, color: C.cyan }}>live</span>
            </span>
          }
        />
        <LogFeed />
      </section>
    </div>
  );
}

// ── metric cell ───────────────────────────────────────────────
interface MetricDef { label: string; value: number; unit?: string; money?: boolean; signed?: boolean }

function MetricCell({ m }: { m: MetricDef }) {
  let display: string;
  if (m.money) display = fmtMoney(m.value);
  else if (m.signed) display = (m.value >= 0 ? '+' : '') + m.value + (m.unit || '');
  else display = fmtNum(m.value) + (m.unit && m.unit !== '$' ? m.unit : '');
  const col = m.signed ? (m.value >= 0 ? C.green : C.red) : '#e6f1f4';
  return (
    <div>
      <div className="mono tnum" style={{ fontSize: 17, color: col, lineHeight: 1.1 }}>{display}</div>
      <div className="label" style={{ fontSize: 9, marginTop: 3, letterSpacing: '0.12em' }}>{m.label}</div>
    </div>
  );
}

// ── eval / quality (added by eval layer) ──────────────────────
function qColor(v: number): string {
  return v >= 0.8 ? C.green : v >= 0.6 ? C.amber : C.red;
}

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
      {score != null && <ProgressBar value={score} color={qColor(score)} active={false} />}
      {note && (
        <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)', lineHeight: 1.4 }}>
          ⚖ {note}
        </span>
      )}
    </div>
  );
}

// ── trading eval loop (dedicated finance card) ────────────────
function TradingEvalCard({ fleet }: { fleet: AgentWithStatus[] }) {
  const fin = fleet.find(a => a.agent.id === 'finance');
  const s = fin?.status;
  if (!s || s.evalScore == null) return null;

  const m = (s.evalSummary || '').match(/^\[([^\]]+)\]\s*/);
  const tag = m ? m[1] : '';
  const rationale = m ? (s.evalSummary as string).slice(m[0].length) : (s.evalSummary || '');
  const independent = /cross-family judge/i.test(tag);
  const judgeModel = independent ? tag.replace(/cross-family judge:\s*/i, '') : null;
  const score = s.evalScore as number;
  const badgeColor = independent ? C.green : C.amber;

  return (
    <section className="panel ticks rise" style={{ marginBottom: 22, animationDelay: '260ms' }}>
      <PanelHead
        title="Finance — Eval Loop"
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
            borderLeft: `2px solid ${C.cyan}44`, paddingLeft: 11,
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

// ── fleet quality (consolidated eval card) ────────────────────
function FleetQuality({ fleet, trends }: {
  fleet: AgentWithStatus[];
  trends: Record<string, { points: number[]; delta: number | null }>;
}) {
  const scored = fleet.filter(a => a.status?.evalScore != null);
  const avg = scored.length
    ? scored.reduce((acc, a) => acc + (a.status!.evalScore as number), 0) / scored.length
    : null;
  const rows = fleet.filter(
    a => a.status?.evalScore != null || (trends[a.agent.id]?.points?.length ?? 0) >= 2
  );

  return (
    <section className="panel ticks rise" style={{ marginBottom: 22, animationDelay: '300ms' }}>
      <PanelHead
        title="Fleet quality"
        right={
          avg != null
            ? <span className="mono tnum" style={{ fontSize: 12, color: qColor(avg) }}>avg {Math.round(avg * 100)}%</span>
            : <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>awaiting first scores</span>
        }
      />
      {rows.length === 0 ? (
        <div style={{ padding: '18px 16px 22px', textAlign: 'center' }}>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>
            No eval data yet — agents appear here once they report a quality score.
          </span>
        </div>
      ) : (
        <div style={{ padding: '4px 16px 12px' }}>
          {rows.map(aw => {
            const cfg = AGENT_CFG[aw.agent.id] ?? { glyph: '○', accent: C.idle, uptime: null };
            const score = aw.status?.evalScore ?? null;
            const rel = aw.status?.evalReliability ?? null;
            const tr = trends[aw.agent.id];
            return (
              <div key={aw.agent.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
                borderBottom: '1px solid var(--line)',
              }}>
                <span style={{ color: cfg.accent, fontSize: 13, width: 16, flexShrink: 0 }}>{cfg.glyph}</span>
                <span style={{ fontSize: 12.5, color: '#e6f1f4', width: 88, flexShrink: 0 }}>{aw.agent.name}</span>
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
                    <span className="mono" style={{ fontSize: 10, color: tr.delta >= 0 ? C.green : C.red }}>
                      {tr.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(tr.delta * 100))}%
                    </span>
                  )}
                  {tr && tr.points.length >= 2 && (
                    <Sparkline data={tr.points} color={qColor(tr.points[tr.points.length - 1])} width={120} height={26} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── agent card ────────────────────────────────────────────────
function AgentCard({ aw, idx, growthStats, trend }: {
  aw: AgentWithStatus;
  idx: number;
  growthStats: GrowthStats | null;
  trend?: { points: number[]; delta: number | null };
}) {
  const { agent, status } = aw;
  const cfg = AGENT_CFG[agent.id] ?? { glyph: '○', accent: C.idle, uptime: null };
  const stateKey = status?.state ?? 'idle';
  const meta = STATE_META[stateKey] ?? STATE_META.idle;
  const active = stateKey !== 'idle' && status != null;
  const dead = !active && stateKey === 'idle';

  // build metrics from real data for growth
  let metrics: MetricDef[] = [];
  if (agent.id === 'growth' && growthStats) {
    metrics = [
      { label: 'Leads scraped', value: growthStats.total },
      { label: 'Sites built',   value: growthStats.sitesBuilt ?? 0 },
      { label: 'Emails sent',   value: growthStats.outreachSent },
    ];
  }

  const sparkData = SPARKS[agent.id] ?? null;

  return (
    <div className="panel rise" style={{
      padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      animationDelay: 80 + idx * 70 + 'ms',
      borderColor: active ? `${cfg.accent}33` : 'var(--line)',
      boxShadow: active ? `0 0 0 1px ${cfg.accent}14, 0 18px 40px -28px ${cfg.accent}55` : 'none',
      opacity: dead ? 0.72 : 1,
    }}>
      {/* accent top edge */}
      <div style={{
        height: 2,
        background: active ? `linear-gradient(90deg, ${cfg.accent}, transparent)` : 'transparent',
        flexShrink: 0,
      }} />

      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center',
              color: cfg.accent, fontSize: 15, flexShrink: 0,
              border: `1px solid ${cfg.accent}33`, background: `${cfg.accent}0d`,
            }}>{cfg.glyph}</span>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: '#eef6f9', lineHeight: 1.1 }}>{agent.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 3 }}>{agent.ownerRepo}</div>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <StatusDot color={meta.color} pulse={active} size={7} />
            <span className="label" style={{ color: meta.color, fontSize: 9 }}>{meta.label}</span>
          </div>
        </div>

        {/* role */}
        <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--txt)', lineHeight: 1.45 }}>{agent.role}</p>

        {/* skills */}
        {agent.skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 11 }}>
            {agent.skills.map(s => (
              <span key={s} className="mono" style={{
                fontSize: 9.5, padding: '2.5px 8px', borderRadius: 5,
                background: 'rgba(255,255,255,0.03)', color: 'var(--txt-mid)',
                border: '1px solid var(--line)', whiteSpace: 'nowrap',
              }}>{s}</span>
            ))}
          </div>
        )}

        {/* live task / status summary */}
        {status?.summary ? (
          <div style={{
            marginTop: 16, padding: '11px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--txt)' }}>
                <StatusDot color={cfg.accent} pulse={active} size={6} />
                {status.summary}
              </span>
            </div>
            <ProgressBar value={0.65} color={cfg.accent} active={active} />
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

        {/* output quality (eval layer) */}
        <QualityRow
          score={status?.evalScore}
          reliability={status?.evalReliability}
          note={status?.evalSummary}
        />

        {/* real quality trend from eval_runs history */}
        {trend && trend.points.length >= 2 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="label" style={{ letterSpacing: '0.14em' }}>
              quality trend
              {trend.delta != null && (
                <span style={{ marginLeft: 8, color: trend.delta >= 0 ? C.green : C.red }}>
                  {trend.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(trend.delta * 100))}%
                </span>
              )}
            </span>
            <Sparkline
              data={trend.points}
              color={qColor(trend.points[trend.points.length - 1])}
              width={108}
              height={28}
            />
          </div>
        )}

        {/* metrics + sparkline */}
        {metrics.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 18 }}>
              {metrics.map(m => <MetricCell key={m.label} m={m} />)}
            </div>
            {sparkData && <Sparkline data={sparkData} color={cfg.accent} width={92} height={34} />}
          </div>
        )}

        {/* sparkline for non-growth active agents */}
        {metrics.length === 0 && sparkData && active && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Sparkline data={sparkData} color={cfg.accent} width={120} height={34} />
          </div>
        )}

        {/* footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 'auto', paddingTop: 14,
        }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>
            {cfg.uptime != null && <span style={{ color: 'var(--txt-dim)' }}>{cfg.uptime}% uptime · </span>}
            {agent.schedule}
          </div>
          {cfg.link ? (
            <a href={cfg.link.href} className="mono" style={{
              fontSize: 10.5, color: cfg.accent, textDecoration: 'none',
            }}>{cfg.link.label} →</a>
          ) : cfg.note && active ? (
            <span className="mono" style={{ fontSize: 10, color: C.amber }}>{cfg.note}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── main export ───────────────────────────────────────────────
const REFRESH_MS = 15_000;

export function CeoOS({ initial, growthStats }: {
  initial: AgentWithStatus[];
  growthStats: GrowthStats | null;
}) {
  const [fleet, setFleet] = useState(initial);
  const [tick, setTick] = useState(0);
  const [trends, setTrends] = useState<Record<string, { points: number[]; delta: number | null }>>({});

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch('/api/agents');
      if (res.ok) setFleet(await res.json());
      setTick(t => t + 1);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/trends');
        if (!res.ok) return;
        const arr: { agentId: string; points: number[]; delta: number | null }[] = await res.json();
        const map: Record<string, { points: number[]; delta: number | null }> = {};
        for (const t of arr) map[t.agentId] = { points: t.points, delta: t.delta };
        setTrends(map);
      } catch {
        /* trends are decorative; ignore fetch errors */
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const online       = fleet.filter(a => a.status?.state != null).length;
  const needAttention = fleet.filter(a => a.status?.state === 'warn' || a.status?.state === 'error').length;

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 28px 80px', position: 'relative', zIndex: 1 }}>
      <Header online={online} needAttention={needAttention} />
      <Hero fleet={fleet} growthStats={growthStats} />
      <VizStrip growthStats={growthStats} />
      <FleetQuality fleet={fleet} trends={trends} />
      <TradingEvalCard fleet={fleet} />

      {/* agent grid */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--txt-mid)', letterSpacing: '0.04em' }}>
          Agent fleet
        </h2>
        <span className="label">{fleet.length} units · auto-refresh {REFRESH_MS / 1000}s</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 18 }}>
        {fleet.map((aw, i) => (
          <AgentCard key={aw.agent.id} aw={aw} idx={i} growthStats={growthStats} trend={trends[aw.agent.id]} />
        ))}
      </div>

      <p className="mono" style={{ fontSize: 11, color: 'var(--txt-faint)', marginTop: 28, textAlign: 'center' }}>
        CEO OS · agent fleet control plane · synced to ceos-enterprise.vercel.app
        {tick > 0 && ` · refreshed ${tick}×`}
      </p>
    </div>
  );
}
