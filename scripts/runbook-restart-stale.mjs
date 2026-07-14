#!/usr/bin/env node
// Automated runbook: "A fleet agent has gone stale."
// Replaces the manual process of noticing a dead agent and hand-restarting it.
// Finds stale agents via /api/health, retriggers them within retry limits, logs
// every action as an audit trail, and escalates to a human only after
// auto-remediation is exhausted.
//
// Decision logic is exported (selectStale, planRemediation) and unit-tested.
//
// Env: HEALTH_URL (required), RETRIGGER_URL_BASE (optional), ALERT_WEBHOOK_URL (optional)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Extract stale agents from a /api/health body. Pure. */
export function selectStale(body) {
  return (body?.agents ?? []).filter((a) => a.stale);
}

/** Read remediation policy from infra/slo.yml (minimal parse, no dep). Pure-ish (fs read). */
export function loadPolicy(baseDir) {
  try {
    const raw = readFileSync(join(baseDir, '..', 'infra', 'slo.yml'), 'utf8');
    return {
      maxRetries: Number((raw.match(/max_retries:\s*(\d+)/) || [])[1] ?? 2),
      escalateAfter: Number((raw.match(/escalate_after:\s*(\d+)/) || [])[1] ?? 2),
    };
  } catch {
    return { maxRetries: 2, escalateAfter: 2 };
  }
}

function audit(event, data = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

async function main() {
  const HEALTH_URL = process.env.HEALTH_URL;
  // Default the retrigger target to the fleet run endpoint derived from HEALTH_URL,
  // e.g. https://…/api/health → https://…/api/agents/{agent}/run. Overridable.
  const RETRIGGER_BASE = process.env.RETRIGGER_URL_BASE
    ?? (process.env.HEALTH_URL ? process.env.HEALTH_URL.replace(/\/api\/health.*$/, '/api/agents/{agent}/run') : undefined);
  const REPORT_SECRET = process.env.REPORT_SECRET; // machine auth for the run endpoint
  const WEBHOOK = process.env.ALERT_WEBHOOK_URL;
  if (!HEALTH_URL) { console.error('HEALTH_URL required'); process.exit(2); }

  const { maxRetries, escalateAfter } = loadPolicy(dirname(fileURLToPath(import.meta.url)));

  const body = await (await fetch(HEALTH_URL, { headers: { 'cache-control': 'no-cache' } })).json();
  const stale = selectStale(body);
  audit('scan', { totalAgents: (body.agents ?? []).length, stale: stale.map((a) => a.agent) });
  if (!stale.length) { audit('noop', { reason: 'no stale agents' }); return; }

  const retrigger = async (agent) => {
    if (!RETRIGGER_BASE) { audit('retrigger_skipped', { agent, reason: 'no RETRIGGER_URL_BASE' }); return false; }
    const url = RETRIGGER_BASE.replace('{agent}', encodeURIComponent(agent));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(REPORT_SECRET ? { 'x-report-secret': REPORT_SECRET } : {}),
        },
        body: JSON.stringify({ source: 'runbook', reason: 'auto-remediation: agent overdue' }),
      });
      audit('retrigger', { agent, status: res.status });
      return res.ok;
    } catch (e) {
      audit('retrigger_failed', { agent, error: e.message });
      return false;
    }
  };
  const escalate = async (text) => {
    audit('escalate', { text });
    if (!WEBHOOK) return;
    await fetch(WEBHOOK, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `⚠️ runbook escalation\n${text}`, text }),
    }).catch(() => {});
  };

  let escalations = 0;
  for (const a of stale) {
    let recovered = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      audit('remediate_attempt', { agent: a.agent, attempt, ageMinutes: a.ageMinutes });
      if (await retrigger(a.agent)) { recovered = true; break; }
    }
    if (!recovered) {
      escalations++;
      await escalate(`Agent "${a.agent}" stale ${a.ageMinutes}m; auto-remediation failed after ${maxRetries} attempts.`);
    }
  }
  audit('summary', { staleCount: stale.length, escalations });
  if (escalations >= escalateAfter) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
