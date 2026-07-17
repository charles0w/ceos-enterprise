// Pure zero-delta detection — dependency-free so it can be unit-tested without
// KV or a database (same pattern as lib/health.ts). lib/digest.ts owns the I/O.
import type { AgentStatus } from './types';

// Canonical form for metrics comparison: Postgres JSONB does not preserve key
// order, so a naive JSON.stringify of prev (from DB) vs next (from the agent)
// can differ despite equal content.
function canonicalMetrics(metrics: AgentStatus['metrics']): string {
  if (!metrics || !Array.isArray(metrics) || metrics.length === 0) return '[]';
  return JSON.stringify(
    metrics.map((m) => [m.label, m.value, m.unit ?? '', !!m.money, !!m.signed]),
  );
}

// Is this report a quiet repeat of the previous one? Quiet = ok state, no
// realized profit, and summary+metrics identical to the last stored status.
// Quiet repeats are demoted to the daily digest instead of pinging #notifs.
export function isQuietRepeat(
  prev: AgentStatus | null,
  next: AgentStatus,
  profit?: { amount: number },
): boolean {
  if (next.state !== 'ok') return false;
  if (profit && Number.isFinite(profit.amount) && profit.amount !== 0) return false;
  if (!prev || prev.state !== 'ok') return false;
  if ((prev.summary ?? '') !== (next.summary ?? '')) return false;
  return canonicalMetrics(prev.metrics) === canonicalMetrics(next.metrics);
}
