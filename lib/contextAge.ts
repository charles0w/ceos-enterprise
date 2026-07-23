// Freshness of the Postgres ai_memory mirror of the Obsidian vault.
// /api/memory/sync stamps LAST_SYNC_KEY on every authed push; the dashboard
// header chip and the daily digest read it through these pure helpers so the
// thresholds live in exactly one place (and stay unit-testable without KV).

export const LAST_SYNC_KEY = 'memory:last-sync';

export type LastSync = { at: string; notes: number } | null;

export type Staleness = {
  level: 'fresh' | 'stale' | 'critical' | 'unknown';
  hours: number | null;
};

const STALE_HOURS = 24;
const CRITICAL_HOURS = 72;

export function contextAge(at: string | null | undefined, nowMs: number): Staleness {
  if (!at) return { level: 'unknown', hours: null };
  const t = Date.parse(at);
  if (Number.isNaN(t)) return { level: 'unknown', hours: null };
  const hours = (nowMs - t) / 3_600_000;
  if (hours >= CRITICAL_HOURS) return { level: 'critical', hours };
  if (hours >= STALE_HOURS) return { level: 'stale', hours };
  return { level: 'fresh', hours };
}

export function contextAgeWarning(s: Staleness, at: string | null | undefined): string | null {
  if (s.level === 'fresh') return null;
  const age = s.hours == null ? 'unknown age' : `${Math.round(s.hours)}h stale`;
  const last = at ? ` (last sync ${at})` : ' (never synced)';
  return `⚠️ ai-memory context is ${age}${last}. Run: node ai-memory/scripts/sync-db.mjs --push`;
}
