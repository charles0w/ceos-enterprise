import { sql } from '@vercel/postgres';
import type { AgentStatus, AgentTrend } from './types';

// Append-only eval history + daily rollup. The agent_status table (registry.ts)
// holds only the LATEST state per agent; this gives the fleet a memory so the
// dashboard can show quality *trends* and the cron can flag drift.

let _ensured = false;
async function ensureEvalTables() {
  if (_ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS eval_runs (
      id BIGSERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL,
      score REAL,
      reliability REAL,
      summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS eval_runs_agent_time ON eval_runs (agent_id, created_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS eval_daily (
      day DATE NOT NULL,
      agent_id TEXT NOT NULL,
      avg_score REAL,
      avg_reliability REAL,
      runs INTEGER NOT NULL,
      PRIMARY KEY (day, agent_id)
    )
  `;
  _ensured = true;
}

/** Append one scored run. Best-effort: never throws into the caller. */
export async function recordEvalRun(agentId: string, status: AgentStatus): Promise<void> {
  if (status.evalScore == null && status.evalReliability == null) return;
  try {
    await ensureEvalTables();
    await sql`
      INSERT INTO eval_runs (agent_id, score, reliability, summary)
      VALUES (${agentId}, ${status.evalScore ?? null}, ${status.evalReliability ?? null}, ${status.evalSummary ?? null})
    `;
  } catch {
    // history is best-effort — a failed insert must never block a status report
  }
}

/** Per-agent quality series over the last `days`, oldest → newest. */
export async function getEvalTrends(days = 14): Promise<AgentTrend[]> {
  try {
    await ensureEvalTables();
    const { rows } = await sql`
      SELECT agent_id, score
      FROM eval_runs
      WHERE score IS NOT NULL AND created_at > now() - make_interval(days => ${days})
      ORDER BY created_at ASC
    `;
    const byAgent: Record<string, number[]> = {};
    for (const r of rows) (byAgent[r.agent_id] ??= []).push(Number(r.score));
    return Object.entries(byAgent).map(([agentId, points]) => {
      const avg = points.reduce((a, b) => a + b, 0) / points.length;
      let delta: number | null = null;
      if (points.length >= 4) {
        const half = Math.floor(points.length / 2);
        const older = points.slice(0, half);
        const recent = points.slice(points.length - half);
        const oa = older.reduce((a, b) => a + b, 0) / older.length;
        const ra = recent.reduce((a, b) => a + b, 0) / recent.length;
        delta = ra - oa;
      }
      return { agentId, points, avg, delta };
    });
  } catch {
    return [];
  }
}

export interface RollupResult {
  ok: boolean;
  upsertedDays: number;
  drift: { agentId: string; recent: number; prior: number; delta: number }[];
}

/** Roll recent runs into per-day aggregates and compute 7d-vs-prior-7d drift. Cron entrypoint. */
export async function rollupDaily(): Promise<RollupResult> {
  await ensureEvalTables();
  const up = await sql`
    INSERT INTO eval_daily (day, agent_id, avg_score, avg_reliability, runs)
    SELECT date_trunc('day', created_at)::date AS day, agent_id,
           avg(score), avg(reliability), count(*)::int
    FROM eval_runs
    WHERE created_at > now() - make_interval(days => 3)
    GROUP BY 1, 2
    ON CONFLICT (day, agent_id) DO UPDATE SET
      avg_score = EXCLUDED.avg_score,
      avg_reliability = EXCLUDED.avg_reliability,
      runs = EXCLUDED.runs
  `;
  const { rows } = await sql`
    SELECT agent_id,
      avg(score) FILTER (WHERE created_at > now() - make_interval(days => 7)) AS recent,
      avg(score) FILTER (WHERE created_at <= now() - make_interval(days => 7)
                          AND created_at > now() - make_interval(days => 14)) AS prior
    FROM eval_runs
    WHERE score IS NOT NULL AND created_at > now() - make_interval(days => 14)
    GROUP BY agent_id
  `;
  const drift = rows
    .filter((r) => r.recent != null && r.prior != null)
    .map((r) => ({
      agentId: r.agent_id,
      recent: Number(r.recent),
      prior: Number(r.prior),
      delta: Number(r.recent) - Number(r.prior),
    }))
    .filter((d) => Math.abs(d.delta) >= 0.05);
  return { ok: true, upsertedDays: up.rowCount ?? 0, drift };
}
