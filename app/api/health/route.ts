import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { kv } from '@vercel/kv';
import { AGENTS, agentRuntime } from '@/lib/agents';
import { classifyFleet, type AgentRow, type AgentRuntimeCfg } from '@/lib/health';

// READINESS check for the CEO's Enterprise fleet dashboard: dependency
// reachability (Postgres/KV) + FLEET FRESHNESS. Freshness is cadence-aware:
// each agent is judged against its own mode/cadence (lib/agents.ts) — scheduled
// agents go "overdue" only when they miss cadence + grace; on-demand agents are
// "idle"/"ready" and never degrade the fleet. Returns 200 healthy / 503 degraded
// so container HEALTHCHECK, Vercel monitors, and scripts/monitor.mjs key off the
// HTTP status. Liveness lives at /api/health/live (process-only, never hits the DB).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Check = { name: string; ok: boolean; detail?: string; latencyMs?: number };

async function timed<T>(fn: () => Promise<T>): Promise<[T | null, number, Error | null]> {
  const start = Date.now();
  try {
    return [await fn(), Date.now() - start, null];
  } catch (e) {
    return [null, Date.now() - start, e as Error];
  }
}

async function checkPostgres(): Promise<Check> {
  const [, latencyMs, err] = await timed(() => sql`SELECT 1`);
  return { name: 'postgres', ok: !err, detail: err?.message, latencyMs };
}

async function checkKV(): Promise<Check> {
  const [, latencyMs, err] = await timed(() => kv.set('health:ping', Date.now()));
  return { name: 'kv', ok: !err, detail: err?.message, latencyMs };
}

async function loadFleet(): Promise<{ check: Check; agents: unknown[] }> {
  // Only agents with a real owner repo are monitored; each carries its resolved cadence.
  const cfgs: AgentRuntimeCfg[] = AGENTS
    .filter((a) => a.ownerRepo && !a.ownerRepo.startsWith('('))
    .map((a) => ({ id: a.id, ...agentRuntime(a) }));

  const [rows, , err] = await timed(async () => {
    const { rows } = await sql`
      SELECT s.id, s.last_run, s.ok, COALESCE(e.errors, 0) AS recent_errors
      FROM fleet_agent_status s
      LEFT JOIN (
        SELECT agent_id, COUNT(*) AS errors
        FROM fleet_events
        WHERE sev = 'err' AND created_at > now() - interval '24 hours'
        GROUP BY agent_id
      ) e ON e.agent_id = s.id
    `;
    return rows as AgentRow[];
  });

  if (err || !rows) return { check: { name: 'fleet', ok: false, detail: err?.message ?? 'query-failed' }, agents: [] };

  const { agents, overdueIds, fleetOk } = classifyFleet(rows, cfgs, Date.now());
  return {
    check: { name: 'fleet', ok: fleetOk, detail: overdueIds.length ? `overdue: ${overdueIds.join(', ')}` : 'all on schedule' },
    agents,
  };
}

export async function GET() {
  const [pg, kvc, fleet] = await Promise.all([checkPostgres(), checkKV(), loadFleet()]);
  const checks = [pg, kvc, fleet.check];
  const healthy = checks.every((c) => c.ok);

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
      checks,
      agents: fleet.agents,
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
