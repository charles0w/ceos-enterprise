import type { AgentStatus } from './types';
import { AGENTS } from './agents';

// Best-effort Discord/Slack notifier. Posts to ALERT_WEBHOOK_URL. Never throws —
// notifications must never break the request that emitted them. Bounded by a
// short timeout so a slow webhook can't hang a serverless response.

const WEBHOOK = () => process.env.ALERT_WEBHOOK_URL;

// A clickable action attached to an alert. customId is what the interactions
// endpoint receives on click — scheme: "run:<agentId>" | "direct:<agentId>".
export type AlertAction = { label: string; customId: string; style?: number };

function buttonRow(actions: AlertAction[]) {
  return [{
    type: 1, // action row
    components: actions.slice(0, 5).map((a) => ({
      type: 2, // button
      style: a.style ?? 2, // secondary (grey) by default
      label: a.label.slice(0, 80),
      custom_id: a.customId.slice(0, 100),
    })),
  }];
}

async function postWithTimeout(url: string, headers: Record<string, string>, body: unknown): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    return await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function notifyDiscord(text: string, actions?: AlertAction[]): Promise<void> {
  const content = text.slice(0, 1900);

  // Buttons require an application-owned message — plain webhooks can't carry
  // components. When the bot token + channel are configured and actions were
  // requested, post via the bot API; on any failure fall through to the webhook
  // (message still arrives, just without buttons — the textual ↩ hints remain).
  const token = process.env.DISCORD_BOT_TOKEN;
  const channel = process.env.DISCORD_CHANNEL_ID;
  if (actions?.length && token && channel) {
    const res = await postWithTimeout(
      `https://discord.com/api/v10/channels/${channel}/messages`,
      { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      { content, components: buttonRow(actions) },
    );
    if (res?.ok) return;
  }

  const url = WEBHOOK();
  if (!url) return;
  // { content } is Discord; { text } is Slack — send both so one webhook works either way.
  await postWithTimeout(url, { 'Content-Type': 'application/json' }, { content, text: content });
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
  // A failed/degraded run should arrive with its own steering wheel attached.
  if (status.state === 'error' || status.state === 'warn') {
    line += `\n  ↩ \`/run ${agentId}\` to retry · \`/direct ${agentId} <instruction>\` to redirect`;
  }
  return line;
}
