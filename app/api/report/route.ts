import { NextRequest, NextResponse } from 'next/server';
import { upsertStatus } from '@/lib/registry';
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
  if (process.env.NOTIFY_ON_REPORT !== '0') {
    await notifyDiscord(formatRunBrief(body.agentId, status, body.profit));
  }

  return NextResponse.json({ ok: true, ...(profitRecorded ? { profitRecorded } : {}) });
}
