import type { AgentStatus } from './types';
import { AGENTS } from './agents';

// Best-effort Discord/Slack notifier. Posts to ALERT_WEBHOOK_URL. Never throws —
// notifications must never break the request that emitted them. Bounded by a
// short timeout so a slow webhook can't hang a serverless response.

const WEBHOOK = () => process.env.ALERT_WEBHOOK_URL;

export async function notifyDiscord(text: string): Promise<void> {
  const url = WEBHOOK();
  if (!url) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // { content } is Discord; { text } is Slack — send both so one webhook works either way.
      body: JSON.stringify({ content: text.slice(0, 1900), text: text.slice(0, 1900) }),
      signal: ctrl.signal,
    });
  } catch {
    /* swallow — best effort */
  } finally {
    clearTimeout(t);
  }
}

const STATE_EMOJI: Record<string, string> = { ok: '✅', warn: '⚠️', error: '🔴' };

function fmtMetricValue(m: { value: number; unit?: string; money?: boolean; signed?: boolean }): string {
  if (m.money) {
    const abs = Math.abs(m.value);
    const s = abs >= 1000 ? `$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k` : `$${abs.toFixed(0)}`;
    return m.value < 0 ? `-${s}` : s;
  }
  const sign = m.signed && m.value >= 0 ? '+' : '';
  return `${sign}${m.value}${m.unit ?? ''}`;
}

// One-line brief of a run for the #notifs channel. Includes the agent, its
// outcome, the summary it reported, up to 3 headline metrics, an eval score if
// present, and any realized profit.
export function formatRunBrief(
  agentId: string,
  status: AgentStatus,
  profit?: { amount: number; note?: string },
): string {
  const name = AGENTS.find((a) => a.id === agentId)?.name ?? agentId;
  const emoji = STATE_EMOJI[status.state] ?? 'ℹ️';
  let line = `${emoji} **${name}** ran — ${status.summary || '(no summary)'}`;

  const metrics = (status.metrics ?? []).map((m) => `${m.label} ${fmtMetricValue(m)}`);
  if (metrics.length) line += `\n  ${metrics.join(' · ')}`;

  if (typeof status.evalScore === 'number') {
    line += `\n  quality ${(status.evalScore * 100).toFixed(0)}%`;
    if (typeof status.evalReliability === 'number') line += ` · reliability ${(status.evalReliability * 100).toFixed(0)}%`;
  }
  if (profit && Number.isFinite(profit.amount) && profit.amount !== 0) {
    const sign = profit.amount >= 0 ? '+' : '-';
    line += `\n  💰 ${sign}$${Math.abs(profit.amount).toFixed(2)}${profit.note ? ` · ${profit.note}` : ''}`;
  }
  return line;
}
