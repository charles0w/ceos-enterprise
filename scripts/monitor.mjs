#!/usr/bin/env node
// Synthetic uptime + fleet-freshness probe. Polls /api/health, enforces a
// latency budget, and pages a Discord/Slack webhook on failure. Exit code is
// non-zero on degradation so CI marks the run red.
//
// The decision logic is exported (evaluateHealth) and unit-tested; the file also
// runs as a CLI when invoked directly.
//
// Env: HEALTH_URL (required), ALERT_WEBHOOK_URL (optional), LATENCY_BUDGET_MS (default 2000)

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
  if (stale.length) problems.push(`stale agents: ${stale.map((a) => `${a.agent}(${a.ageMinutes}m)`).join(', ')}`);
  const failed = (body?.checks ?? []).filter((c) => !c.ok);
  if (failed.length) problems.push(`failed checks: ${failed.map((c) => c.name).join(', ')}`);
  return { problems, degraded: problems.length > 0 };
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

async function main() {
  const HEALTH_URL = process.env.HEALTH_URL;
  const WEBHOOK = process.env.ALERT_WEBHOOK_URL;
  const BUDGET = Number(process.env.LATENCY_BUDGET_MS ?? '2000');
  if (!HEALTH_URL) { console.error('HEALTH_URL is required'); process.exit(2); }

  const start = Date.now();
  let res, body;
  try {
    res = await fetch(HEALTH_URL, { headers: { 'cache-control': 'no-cache' } });
    body = await res.json();
  } catch (e) {
    await alert(WEBHOOK, `🔴 CEO's Enterprise UNREACHABLE — ${HEALTH_URL} — ${e.message}`);
    process.exit(1);
  }
  const latencyMs = Date.now() - start;
  const { problems, degraded } = evaluateHealth({ httpStatus: res.status, body, latencyMs, budgetMs: BUDGET });

  if (degraded) {
    await alert(WEBHOOK, `🔴 CEO's Enterprise DEGRADED\n• ${problems.join('\n• ')}\n${HEALTH_URL}`);
    console.error('DEGRADED:', problems.join('; '));
    process.exit(1);
  }
  console.log(`✅ healthy — ${latencyMs}ms — ${(body.agents ?? []).length} agents fresh`);
}

// Run only when executed directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) main();
