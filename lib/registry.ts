import { sql } from '@vercel/postgres';
import { kv } from '@vercel/kv';
import { AGENTS } from './agents';
import { getGrowthStats } from './growth';
import { getJobStats } from './jobs';
import type { AgentStatus, AgentWithStatus } from './types';
import { recordEvalRun } from './evals';
import { notifyDiscord } from './notify';

const KV_PREFIX = 'agent:status:';

// The dashboard's own status table. NOTE: this was previously named
// `agent_status`, but on ~2026-06-01 the shared Neon DB gained an external
// `agent_status` VIEW (over `agents` + `runs`, owned by the CEO-orchestrator
// schema) that shadowed our table — every INSERT threw "cannot insert into
// view" and statuses silently fell back to KV for six weeks while /api/health
// kept reading the frozen view. Do not rename this back.

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS fleet_agent_status (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      last_run TIMESTAMPTZ NOT NULL,
      summary TEXT NOT NULL,
      ok BOOLEAN NOT NULL,
      eval_score REAL,
      eval_reliability REAL,
      eval_summary TEXT,
      metrics JSONB,
      progress REAL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
}

export async function getFleet(): Promise<AgentWithStatus[]> {
  const [statuses, growthStats, jobStats] = await Promise.all([
    getAllStatuses(),
    getGrowthStats(),
    getJobStats(),
  ]);

  if (growthStats && growthStats.total > 0) {
    const summary = `${growthStats.total} scraped · ${growthStats.sitesBuilt} sites built · ${growthStats.outreachSent} emails sent · ${growthStats.outreachReplied} replies · ${growthStats.closed} closed`;
    statuses['growth'] = {
      ...statuses['growth'],
      state: 'ok',
      lastRun: growthStats.lastScrapedAt ?? new Date().toISOString(),
      summary,
      ok: true,
    };
  }

  if (jobStats && jobStats.discovered > 0) {
    const summary = `${jobStats.discovered} found · ${jobStats.tailored} tailored · ${jobStats.submitted} applied · ${jobStats.interviews} interviews · ${jobStats.offers} offers`;
    statuses['jobs'] = {
      ...statuses['jobs'],
      state: 'ok',
      lastRun: jobStats.lastActivityAt ?? new Date().toISOString(),
      summary,
      ok: true,
    };
  }

  return AGENTS.map((agent) => ({
    agent,
    status: statuses[agent.id] ?? null,
  }));
}

async function getAllStatuses(): Promise<Record<string, AgentStatus>> {
  try {
    await ensureTable();
    const { rows } = await sql`SELECT * FROM fleet_agent_status`;
    return Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          state: r.state,
          lastRun: r.last_run,
          summary: r.summary,
          ok: r.ok,
          evalScore: r.eval_score ?? undefined,
          evalReliability: r.eval_reliability ?? undefined,
          evalSummary: r.eval_summary ?? undefined,
          metrics: r.metrics ?? undefined,
          progress: r.progress ?? undefined,
        } as AgentStatus,
      ])
    );
  } catch {
    // KV fallback
    const entries = await Promise.all(
      AGENTS.map(async (a) => {
        const s = await kv.get<AgentStatus>(`${KV_PREFIX}${a.id}`);
        return [a.id, s] as const;
      })
    );
    return Object.fromEntries(entries.filter(([, v]) => v != null && v.state != null)) as Record<string, AgentStatus>;
  }
}

// Single-agent read of the LAST stored status (used by /api/report to detect
// zero-delta repeats before overwriting). Same fallback order as reads above.
export async function getStatus(agentId: string): Promise<AgentStatus | null> {
  try {
    const { rows } = await sql`SELECT * FROM fleet_agent_status WHERE id = ${agentId}`;
    const r = rows[0];
    if (!r) return null;
    return {
      state: r.state,
      lastRun: r.last_run,
      summary: r.summary,
      ok: r.ok,
      metrics: r.metrics ?? undefined,
      progress: r.progress ?? undefined,
    } as AgentStatus;
  } catch {
    return (await kv.get<AgentStatus>(`${KV_PREFIX}${agentId}`).catch(() => null)) ?? null;
  }
}

// Mirror the run into the external CEO-orchestrator schema (`agents` + `runs`,
// which its `agent_status` view reads) so both worlds stay fresh. Best-effort:
// that schema is not ours, so a failure here never blocks the primary write.
async function mirrorToRuns(agentId: string, status: AgentStatus): Promise<void> {
  try {
    await sql`
      INSERT INTO runs (agent_id, state, summary, ok, started_at, ended_at)
      VALUES (${agentId}, ${status.state}, ${status.summary}, ${status.ok}, ${status.lastRun}, ${status.lastRun})
    `;
  } catch (e) {
    console.warn(`[registry] runs mirror skipped for ${agentId}:`, (e as Error).message);
  }
}

// One deduped page when status persistence degrades to KV. Without this, a
// broken Postgres write path is invisible: /api/report still returns 200 and
// still posts "✅ ran" briefs (exactly how the June–July split-brain hid).
async function alertPersistenceFallback(agentId: string, err: Error): Promise<void> {
  console.error(`[registry] Postgres status write FAILED for ${agentId}, fell back to KV:`, err.message);
  try {
    const first = await kv.set('alert:persistence-fallback', new Date().toISOString(), { nx: true, ex: 21600 });
    if (first !== null) {
      await notifyDiscord(
        `🟠 **Fleet persistence degraded** — status writes are falling back to KV (first seen: ${agentId}).\n` +
        `• error: ${err.message.slice(0, 200)}\n` +
        `• /api/health will drift from reality until Postgres writes recover — investigate \`fleet_agent_status\`.\n` +
        `• (deduped: next reminder in 6h at the earliest)`
      );
    }
  } catch {
    /* alerting must never break the report path */
  }
}

export async function upsertStatus(agentId: string, status: AgentStatus): Promise<void> {
  // Append to time-series history (best-effort; never blocks the status write).
  await recordEvalRun(agentId, status);
  try {
    await ensureTable();
    await sql`
      INSERT INTO fleet_agent_status (id, state, last_run, summary, ok, eval_score, eval_reliability, eval_summary, metrics, progress, updated_at)
      VALUES (
        ${agentId}, ${status.state}, ${status.lastRun}, ${status.summary}, ${status.ok},
        ${status.evalScore ?? null}, ${status.evalReliability ?? null}, ${status.evalSummary ?? null},
        ${status.metrics ? JSON.stringify(status.metrics) : null}, ${status.progress ?? null}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        state = EXCLUDED.state,
        last_run = EXCLUDED.last_run,
        summary = EXCLUDED.summary,
        ok = EXCLUDED.ok,
        eval_score = EXCLUDED.eval_score,
        eval_reliability = EXCLUDED.eval_reliability,
        eval_summary = EXCLUDED.eval_summary,
        metrics = EXCLUDED.metrics,
        progress = EXCLUDED.progress,
        updated_at = now()
    `;
  } catch (e) {
    // KV fallback keeps the dashboard alive, but it must be LOUD, not silent.
    await kv.set(`${KV_PREFIX}${agentId}`, status);
    await alertPersistenceFallback(agentId, e as Error);
    return;
  }
  // Keep KV warm as the read-fallback, and keep the external view fresh.
  await kv.set(`${KV_PREFIX}${agentId}`, status).catch(() => {});
  await mirrorToRuns(agentId, status);
}
