'use client';

// ── CEO OS v2 — chrome primitives, hooks, formatters ─────────
// The shared visual vocabulary: monochrome silver/chrome, color
// only where status demands it (ok/warn/err).

import { useState, useEffect } from 'react';

export const CHROME_GRAD = 'linear-gradient(90deg, #5b5e68, #b9bcc7 45%, #f2f3f7 60%, #9a9da8)';

// ── status dot ────────────────────────────────────────────────
export function StatusDot({ color, pulse, size = 8 }: { color: string; pulse?: boolean; size?: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      {pulse && (
        <span style={{
          position: 'absolute', inset: -3, borderRadius: 999,
          border: `1px solid ${color}`, opacity: 0.5,
          animation: 'pulseDot 2.4s ease-in-out infinite', color,
        }} />
      )}
      <span style={{
        width: size, height: size, borderRadius: 999, background: color,
        boxShadow: `0 0 8px ${color}aa`, display: 'block',
      }} />
    </span>
  );
}

// ── chrome image tile (black-bg refs, screen-blended) ─────────
// Source photos carry large black margins; 1.45 crop + brightness(1.3)
// is the legibility sweet spot at 26–36px. Don't exceed ~2×.
export function ChromeIcon({ src, size = 34, zoom = 1.45, radius = 10 }:
  { src: string; size?: number; zoom?: number; radius?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      border: '1px solid var(--line-2)',
      background: '#000', overflow: 'hidden',
      display: 'grid', placeItems: 'center', position: 'relative',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="blend" style={{
        width: size * zoom, height: size * zoom, objectFit: 'cover',
        display: 'block', flexShrink: 0,
        filter: 'brightness(1.3) contrast(1.1)',
      }} />
    </span>
  );
}

// ── glyph tile — same frame as ChromeIcon, for agents without a sigil photo ──
export function GlyphTile({ glyph, size = 34, radius = 10, color = 'var(--silver)' }:
  { glyph: string; size?: number; radius?: number; color?: string }) {
  return (
    <span className="mono" style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      border: '1px solid var(--line-2)', background: '#000',
      display: 'grid', placeItems: 'center', color,
      fontSize: Math.round(size * 0.42),
    }}>{glyph}</span>
  );
}

// ── sparkline ─────────────────────────────────────────────────
export function Sparkline({ data, color = '#b9bcc7', width = 92, height = 34 }:
  { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pad = 3;
  const X = (i: number) => (i / (data.length - 1)) * width;
  const Y = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const gid = 'sg2' + color.replace('#', '') + width;
  const lastX = X(data.length - 1), lastY = Y(data[data.length - 1]);
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.4"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="4" fill="#f2f3f7" opacity="0.2" />
      <circle cx={lastX} cy={lastY} r="1.8" fill="#f2f3f7" />
    </svg>
  );
}

// ── chrome progress bar ───────────────────────────────────────
export function ProgressBar({ value, active = true, height = 6 }:
  { value: number; active?: boolean; height?: number }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{
      height, borderRadius: 99, background: 'rgba(255,255,255,0.045)',
      overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, width: pct + '%',
        background: CHROME_GRAD,
        borderRadius: 99, transition: 'width 1.2s cubic-bezier(.2,.7,.3,1)',
        boxShadow: '0 0 10px rgba(226,228,236,0.35)',
      }}>
        {active && (
          <span style={{
            position: 'absolute', top: 0, bottom: 0, width: '40%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
            animation: 'shimmer 2.8s ease-in-out infinite',
          }} />
        )}
      </div>
    </div>
  );
}

// ── KPI ───────────────────────────────────────────────────────
export function Kpi({ label, value, suffix, color, align = 'left' }:
  { label: string; value: string | number; suffix?: string; color?: string; align?: 'left' | 'right' }) {
  return (
    <div style={{ textAlign: align }}>
      <div className="label">{label}</div>
      <div className="mono tnum" style={{
        fontSize: 26, fontWeight: 500, color: color || 'var(--white)', marginTop: 5, lineHeight: 1,
      }}>
        {value}{suffix && <span style={{ fontSize: 13, color: 'var(--txt-mid)', marginLeft: 2 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ── panel head ────────────────────────────────────────────────
export function PanelHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="panel-head">
      <span className="label" style={{ color: 'var(--txt-mid)', letterSpacing: '0.18em' }}>{title}</span>
      <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{right}</span>
    </div>
  );
}

// ── hooks ─────────────────────────────────────────────────────
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// rAF count-up with a setTimeout fallback that lands the final value
// when rAF is throttled (backgrounded tab).
export function useCountUp(target: number, dur = 1100): number {
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

export function useRotator<T>(items: readonly T[], ms = 14000): [T, number] {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % items.length), ms);
    return () => clearInterval(id);
  }, [items.length, ms]);
  return [items[i], i];
}

// ── formatters ────────────────────────────────────────────────
export function fmtMoney(n: number): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return '$' + Math.round(n);
}

export function fmtNum(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toLocaleString();
}

export function greetingFor(h: number): string {
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Welcome home';
}
