import { NextRequest, NextResponse } from 'next/server';
import { upsertStatus, getStatus } from '@/lib/registry';
import { isQuietRepeat, recordSuppressed } from '@/lib/digest';
import { recordProfit } from '@/lib/garage';
import { logEvent } from '@/lib/events';
import { notifyDiscord, formatRunBrief } from '@/lib/notify';
import type { AgentStatus, AgentMetric } from '@/lib/types';

export const dynamic = 'force-dynamic';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Keep stray reporter payloads from polluting the dashboard: cap at 3
// metrics (all a card shows), drop malformed entries, clamp progress.
function sanitizeStatus(status: AgentStatus): AgentStatus {
  const out = { ...status };
  if (out.metrics != null) {
    const metrics = (Array.isArray(out.metrics) ? out.metrics : [])
      .filter((m): m is AgentMetric =>
        m != null && typeof m.label === 'string' && m.label.length > 0 &&
        typeof m.value === 'number' && Number.isFinite(m.value))
      .slice(0, 3)
      .map((m) => ({
        label: String(m.label).slice(0, 24),
        value: m.value,
        ...(typeof m.unit === 'string' ? { unit: m.unit.slice(0, 8) } : {}),
        ...(m.money ? { money: true } : {}),
        ...(m.signed ? { signed: true } : {}),
      }));
    out.metrics = metrics.length ? metrics : undefined;
  }
  if (out.progress != null) {
    out.progress = typeof out.progress === 'number' && Number.isFinite(out.progress)
      ? clamp01(out.progress)
      : undefined;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-report-secret');
  if (!secret || secret !== process.env.REPORT_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body: {
    agentId: string;
    status: AgentStatus;
    // Optional realized profit/loss for this run — appended to the Garage
    // ledger (profit_events). Send it ONCE per realized win, not on every
    // status heartbeat, or the ledger double-counts.
    profit?: { amount: number; note?: string };
  } = await req.json();
  if (!body.agentId || !body.status) {
    return NextResponse.json({ error: 'missing agentId or status' }, { status: 400 });
  }

  const status = sanitizeStatus(body.status);
  // Snapshot the previous status BEFORE overwriting — it decides whether this
  // run is news (post realtime) or a quiet repeat (count into the daily digest).
  const prev = await getStatus(body.agentId);
  await upsertStatus(body.agentId, status);
  await logEvent(
    body.agentId,
    status.state === 'error' ? 'err' : status.state === 'warn' ? 'warn' : 'ok',
    status.summary,
  );

  let profitRecorded = false;
  if (body.profit != null) {
    const amount = Number(body.profit.amount);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) {
      return NextResponse.json({ error: 'profit.amount must be a non-zero number (|amount| ≤ 1M)' }, { status: 400 });
    }
    const note = body.profit.note ? String(body.profit.note).slice(0, 200) : undefined;
    await recordProfit(body.agentId, amount, note);
    const sign = amount >= 0 ? '+' : '-';
    await logEvent(body.agentId, 'ok', `profit realized — ${sign}$${Math.abs(amount).toFixed(2)}${note ? ` · ${note}` : ''}`);
    profitRecorded = true;
  }

  // Post a run brief to #notifs (best-effort). Disable with NOTIFY_ON_REPORT=0.
  // Zero-delta repeats (ok state, no profit, summary+metrics unchanged) are
  // demoted to the daily digest cron instead of pinging in realtime.
  let suppressed = false;
  if (process.env.NOTIFY_ON_REPORT !== '0') {
    if (isQuietRepeat(prev, status, body.profit)) {
      await recordSuppressed(body.agentId, status.summary ?? '');
      suppressed = true;
    } else {
      // Failed/degraded runs carry one-tap buttons (Retry / Send direction);
      // clicks land on /api/discord/interactions. Falls back to the textual
      // ↩ hints if the bot channel isn't configured.
      const actions = status.state === 'error' || status.state === 'warn'
        ? [
            { label: '▶ Retry now', customId: `run:${body.agentId}`, style: 1 },
            { label: '✎ Send direction', customId: `direct:${body.agentId}` },
          ]
        : undefined;
      await notifyDiscord(formatRunBrief(body.agentId, status, body.profit), actions);
    }
  }

  return NextResponse.json({
    ok: true,
    ...(profitRecorded ? { profitRecorded } : {}),
    ...(suppressed ? { notified: 'digest' } : {}),
  });
}
