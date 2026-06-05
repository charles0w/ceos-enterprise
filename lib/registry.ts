import { sql } from '@vercel/postgres';
import { kv } from '@vercel/kv';
import { AGENTS } from './agents';
import { getGrowthStats } from './growth';
import type { AgentStatus, AgentWithStatus } from './types';
import { recordEvalRun } from './evals';

const KV_PREFIX = 'agent:status:';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS agent_status (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      last_run TIMESTAMPTZ NOT NULL,
      summary TEXT NOT NULL,
      ok BOOLEAN NOT NULL,
      eval_score REAL,
      eval_reliability REAL,
      eval_summary TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  // Migration for tables created before the eval layer existed.
  await sql`ALTER TABLE agent_status ADD COLUMN IF NOT EXISTS eval_score REAL`;
  await sql`ALTER TABLE agent_status ADD COLUMN IF NOT EXISTS eval_reliability REAL`;
  await sql`ALTER TABLE agent_status ADD COLUMN IF NOT EXISTS eval_summary TEXT`;
}

export async function getFleet(): Promise<AgentWithStatus[]> {
  const [statuses, growthStats] = await Promise.all([getAllStatuses(), getGrowthStats()]);

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

  return AGENTS.map((agent) => ({
    agent,
    status: statuses[agent.id] ?? null,
  }));
}

async function getAllStatuses(): Promise<Record<string, AgentStatus>> {
  try {
    await ensureTable();
    const { rows } = await sql`SELECT * FROM agent_status`;
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

export async function upsertStatus(agentId: string, status: AgentStatus): Promise<void> {
  // Append to time-series history (best-effort; never blocks the status write).
  await recordEvalRun(agentId, status);
  try {
    await ensureTable();
    await sql`
      INSERT INTO agent_status (id, state, last_run, summary, ok, eval_score, eval_reliability, eval_summary, updated_at)
      VALUES (
        ${agentId}, ${status.state}, ${status.lastRun}, ${status.summary}, ${status.ok},
        ${status.evalScore ?? null}, ${status.evalReliability ?? null}, ${status.evalSummary ?? null}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        state = EXCLUDED.state,
        last_run = EXCLUDED.last_run,
        summary = EXCLUDED.summary,
        ok = EXCLUDED.ok,
        eval_score = EXCLUDED.eval_score,
        eval_reliability = EXCLUDED.eval_reliability,
        eval_summary = EXCLUDED.eval_summary,
        updated_at = now()
    `;
  } catch {
    // KV fallback
    await kv.set(`${KV_PREFIX}${agentId}`, status);
  }
}
