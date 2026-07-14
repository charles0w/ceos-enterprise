// Pure, dependency-free health helpers — extracted from the API routes so the
// classification logic can be unit-tested without a database or a running server.
// The routes do I/O (query Postgres/KV) and delegate all decisions to these functions.

export interface AgentRow {
  id: string;
  last_run: string | Date | null;
  ok?: boolean | null;
  recent_errors?: number | null;
}

export interface ClassifiedAgent {
  agent: string;
  lastSeen: string | null;
  ageMinutes: number | null;
  ok: boolean | null;
  recentErrors: number;
  stale: boolean;
}

export interface FleetClassification {
  agents: ClassifiedAgent[];
  staleIds: string[];
  fleetOk: boolean;
}

/**
 * Classify each active agent as fresh or stale from its last self-report.
 * An agent with no row at all is treated as stale (never reported = unhealthy).
 * Staleness is strictly greater-than the budget, so an agent exactly at the
 * threshold is still considered fresh.
 */
export function classifyFleet(
  rows: AgentRow[],
  activeAgentIds: string[],
  nowMs: number,
  staleMinutes: number,
): FleetClassification {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const agents: ClassifiedAgent[] = activeAgentIds.map((id) => {
    const r = byId.get(id);
    if (!r || r.last_run == null) {
      return { agent: id, lastSeen: null, ageMinutes: null, ok: false, recentErrors: 0, stale: true };
    }
    const ts = new Date(r.last_run).getTime();
    const ageMinutes = (nowMs - ts) / 60000;
    return {
      agent: id,
      lastSeen: new Date(ts).toISOString(),
      ageMinutes: Math.round(ageMinutes),
      ok: r.ok ?? null,
      recentErrors: Number(r.recent_errors ?? 0),
      stale: ageMinutes > staleMinutes,
    };
  });
  const staleIds = agents.filter((a) => a.stale).map((a) => a.agent);
  return { agents, staleIds, fleetOk: staleIds.length === 0 };
}

/** Render a single Prometheus metric block (HELP + TYPE + samples). */
export function promBlock(name: string, help: string, type: string, samples: string[]): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${samples.join('\n')}\n`;
}
