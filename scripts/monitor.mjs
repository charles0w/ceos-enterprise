#!/usr/bin/env node
// Synthetic uptime + fleet-freshness probe. Polls /api/health, enforces a
// latency budget, and pages a Discord/Slack webhook on STATE TRANSITIONS only:
//   healthy→degraded  → one 🔴 alert (with problems + suggested action)
//   degraded→healthy  → one 🟢 recovery note (with downtime duration)
//   no change         → log only, no Discord post
// Previous status is persisted in the app itself (PUT /api/monitor/state,
// KV-backed) because this script runs stateless in GitHub Actions.
//
// The decision logic is exported (evaluateHealth, decideAlert) and unit-tested;
// the file also runs as a CLI when invoked directly.
//
// Env: HEALTH_URL (required), ALERT_WEBHOOK_URL (optional),
//      LATENCY_BUDGET_MS (default 2000), REPORT_SECRET (for state persistence;
//      without it the monitor falls back to alert-every-time behavior).

/**
 * Pure decision function: given the probe result, return the list of problems.
 * No I/O — fully unit-testable.
 * @returns {{problems: string[], degraded: boolean}}
 */
export function evaluateHealth({ httpStatus, body, latencyMs, budgetMs }) {
  const problems = [];
  if (httpStatus !== 200) problems.push(`status=${httpStatus} (${body?.status ?? 'unknown'})`);
  if (typeof latencyMs === 'number' && latencyMs > budgetMs) {
    problems.push(`latency=${latencyMs}ms > budget=${budgetMs}ms`);
  }
  const stale = (body?.agents ?? []).filter((a) => a.stale);
  if (stale.length) {
    problems.push(`stale agents: ${stale.map((a) => `${a.agent}(${a.ageMinutes == null ? 'never ran' : `${a.ageMinutes}m`})`).join(', ')}`);
  }
  const failed = (body?.checks ?? []).filter((c) => !c.ok);
  if (failed.length) problems.push(`failed checks: ${failed.map((c) => c.name).join(', ')}`);
  return { problems, degraded: problems.length > 0 };
}

/**
 * Pure transition logic: should this run post to Discord, and what kind?
 * prevStatus is 'healthy' | 'degraded' | 'unknown' (no state yet / state API down).
 * On 'unknown' we only alert if degraded (never spam-safe default: a broken
 * state store while healthy stays silent; while degraded it pages — correct,
 * because an unreachable app degrades the state API too).
 * @returns {'page'|'recover'|'none'}
 */
export function decideAlert(prevStatus, degraded) {
  if (degraded) return prevStatus === 'degraded' ? 'none' : 'page';
  return prevStatus === 'degraded' ? 'recover' : 'none';
}

async function alert(webhook, text) {
  if (!webhook) {
    console.error('[alert-suppressed:no-webhook]', text);
    return;
  }
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text, text }),
  }).catch((e) => console.error('alert delivery failed:', e.message));
}

function stateUrlFrom(healthUrl) {
  return new URL('/api/monitor/state', healthUrl).toString();
}

async function readState(healthUrl) {
  try {
    const res = await fetch(stateUrlFrom(healthUrl), { headers: { 'cache-control': 'no-cache' } });
    const body = await res.json();
    return body?.status === 'healthy' || body?.status === 'degraded'
      ? { status: body.status, since: body.since ?? null }
      : { status: 'unknown', since: null };
  } catch {
    return { status: 'unknown', since: null };
  }
}

async function writeState(healthUrl, secret, status) {
  if (!secret) return;
  await fetch(stateUrlFrom(healthUrl), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-report-secret': secret },
    body: JSON.stringify({ status }),
  }).catch((e) => console.error('state write failed:', e.message));
}

function fmtDowntime(sinceIso) {
  if (!sinceIso) return '';
  const mins = Math.round((Date.now() - Date.parse(sinceIso)) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return '';
  return mins >= 90 ? ` after ${(mins / 60).toFixed(1)}h` : ` after ${mins}m`;
}

async function main() {
  const HEALTH_URL = process.env.HEALTH_URL;
  const WEBHOOK = process.env.ALERT_WEBHOOK_URL;
  const SECRET = process.env.REPORT_SECRET;
  const BUDGET = Number(process.env.LATENCY_BUDGET_MS ?? '2000');
  if (!HEALTH_URL) { console.error('HEALTH_URL is required'); process.exit(2); }

  const start = Date.now();
  let res, body;
  try {
    res = await fetch(HEALTH_URL, { headers: { 'cache-control': 'no-cache' } });
    body = await res.json();
  } catch (e) {
    // Whole app unreachable — the state API is down too, so page unconditionally.
    await alert(WEBHOOK, `🔴 CEO's Enterprise UNREACHABLE — ${HEALTH_URL} — ${e.message}`);
    process.exit(1);
  }
  const latencyMs = Date.now() - start;
  const { problems, degraded } = evaluateHealth({ httpStatus: res.status, body, latencyMs, budgetMs: BUDGET });

  const prev = await readState(HEALTH_URL);
  const action = decideAlert(prev.status, degraded);

  if (action === 'page') {
    await alert(WEBHOOK, [
      `🔴 **CEO's Enterprise DEGRADED** (state change — you'll get ONE recovery ping when it clears)`,
      ...problems.map((p) => `• ${p}`),
      `→ dashboard: ${new URL('/', HEALTH_URL).origin} · health: ${HEALTH_URL}`,
      `→ act: reply here with /run <agent> or /direct <agent> <instruction>`,
    ].join('\n'));
  } else if (action === 'recover') {
    await alert(WEBHOOK, `🟢 **CEO's Enterprise RECOVERED**${fmtDowntime(prev.since)} — all checks passing, ${(body.agents ?? []).length} agents on schedule.`);
  }

  await writeState(HEALTH_URL, SECRET, degraded ? 'degraded' : 'healthy');

  if (degraded) {
    console.error(`DEGRADED (${action === 'page' ? 'paged' : 'already alerted — suppressed'}):`, problems.join('; '));
    process.exit(1);
  }
  console.log(`✅ healthy — ${latencyMs}ms — ${(body.agents ?? []).length} agents fresh${action === 'recover' ? ' (recovery posted)' : ''}`);
}

// Run only when executed directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) main();
