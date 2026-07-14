import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { kv } from '@vercel/kv';
import { AGENTS } from '@/lib/agents';
import { classifyFleet, type AgentRow } from '@/lib/health';

// READINESS check for the CEO's Enterprise fleet dashboard: dependency
// reachability (Postgres/KV) + FLEET FRESHNESS (each registered agent has
// self-reported within its staleness budget, via agent_status.last_run).
// Returns 200 healthy / 503 degraded so container HEALTHCHECK, Vercel monitors,
// and scripts/monitor.mjs all key off HTTP status.  Liveness lives at
// /api/health/live (process-only, never touches the DB).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STALE_MINUTES = Number(process.env.AGENT_STALE_MINUTES ?? '15');

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
  const active = AGENTS.filter((a) => a.ownerRepo && !a.ownerRepo.startsWith('(')).map((a) => a.id);
  const [rows, , err] = await timed(async () => {
    const { rows } = await sql`
      SELECT s.id, s.last_run, s.ok, COALESCE(e.errors, 0) AS recent_errors
      FROM agent_status s
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

  const { agents, staleIds, fleetOk } = classifyFleet(rows, active, Date.now(), STALE_MINUTES);
  return {
    check: { name: 'fleet', ok: fleetOk, detail: staleIds.length ? `stale: ${staleIds.join(', ')}` : 'all fresh' },
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
      staleThresholdMinutes: STALE_MINUTES,
      checks,
      agents: fleet.agents,
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
