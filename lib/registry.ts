import { sql } from '@vercel/postgres';
import { kv } from '@vercel/kv';
import { AGENTS } from './agents';
import { getGrowthStats } from './growth';
import type { AgentStatus, AgentWithStatus } from './types';

const KV_PREFIX = 'agent:status:';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS agent_status (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      last_run TIMESTAMPTZ NOT NULL,
      summary TEXT NOT NULL,
      ok BOOLEAN NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
}

export async function getFleet(): Promise<AgentWithStatus[]> {
  const [statuses, growthStats] = await Promise.all([getAllStatuses(), getGrowthStats()]);

  if (growthStats && growthStats.total > 0) {
    const summary = `${growthStats.total} bizs scraped · ${growthStats.outreachSent} emails sent · ${growthStats.outreachReplied} replies · ${growthStats.closed} closed`;
    statuses['growth'] = {
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
        { state: r.state, lastRun: r.last_run, summary: r.summary, ok: r.ok } as AgentStatus,
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
    return Object.fromEntries(entries.filter(([, v]) => v != null)) as Record<string, AgentStatus>;
  }
}

export async function upsertStatus(agentId: string, status: AgentStatus): Promise<void> {
  try {
    await ensureTable();
    await sql`
      INSERT INTO agent_status (id, state, last_run, summary, ok, updated_at)
      VALUES (${agentId}, ${status.state}, ${status.lastRun}, ${status.summary}, ${status.ok}, now())
      ON CONFLICT (id) DO UPDATE SET
        state = EXCLUDED.state,
        last_run = EXCLUDED.last_run,
        summary = EXCLUDED.summary,
        ok = EXCLUDED.ok,
        updated_at = now()
    `;
  } catch {
    // KV fallback
    await kv.set(`${KV_PREFIX}${agentId}`, status);
  }
}
