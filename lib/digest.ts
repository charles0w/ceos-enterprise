import { kv } from '@vercel/kv';
import { AGENTS } from './agents';
export { isQuietRepeat } from './quiet';

// Zero-delta run-brief demotion. An hourly "fulfillment tick clean · GMV $0"
// that is byte-identical to the previous one carries no information — posting
// it to #notifs trains the reader to ignore the channel. Such repeats are
// counted here (KV) instead, and a daily cron rolls them into one digest.
// Anything with signal — a warn/error state, realized profit, or a changed
// summary/metrics — still posts in realtime from /api/report.

const COUNTS_KEY = 'digest:pending:counts';
const LAST_KEY = 'digest:pending:last';

export async function recordSuppressed(agentId: string, summary: string): Promise<void> {
  try {
    await kv.hincrby(COUNTS_KEY, agentId, 1);
    await kv.hset(LAST_KEY, { [agentId]: summary.slice(0, 120) });
  } catch {
    /* best-effort — losing a digest count must never break /api/report */
  }
}

// Build the digest text and clear the pending counters. Returns null when
// nothing was suppressed since the last flush (no message should be posted).
export async function flushDigest(): Promise<string | null> {
  const counts = ((await kv.hgetall(COUNTS_KEY)) ?? {}) as Record<string, number>;
  const last = ((await kv.hgetall(LAST_KEY)) ?? {}) as Record<string, string>;
  const ids = Object.keys(counts);
  if (!ids.length) return null;

  const lines = ids
    .sort((a, b) => Number(counts[b]) - Number(counts[a]))
    .map((id) => {
      const name = AGENTS.find((a) => a.id === id)?.name ?? id;
      const n = Number(counts[id]);
      return `• **${name}** — ${n} quiet ${n === 1 ? 'run' : 'runs'} (no change)${last[id] ? ` · last: ${last[id]}` : ''}`;
    });

  await Promise.all([kv.del(COUNTS_KEY), kv.del(LAST_KEY)]);
  return `📋 **Daily fleet digest** — unchanged runs rolled up (realtime pings are reserved for money, errors, and changes)\n${lines.join('\n')}`;
}
