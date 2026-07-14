// Pure, dependency-free health helpers — extracted from the API routes so the
// classification logic can be unit-tested without a database or a running server.
// The routes do I/O (query Postgres/KV) and delegate all decisions to these functions.

export interface AgentRow {
  id: string;
  last_run: string | Date | null;
  ok?: boolean | null;
  recent_errors?: number | null;
}

// Runtime cadence for one agent (resolved via lib/agents.ts agentRuntime()).
export interface AgentRuntimeCfg {
  id: string;
  mode: 'scheduled' | 'on-demand' | 'continuous';
  cadenceMinutes: number | null;
  graceMinutes: number;
}

// Honest, cadence-aware states:
//   ok        — ran within its cadence + grace
//   overdue   — scheduled/continuous agent missed its window (unhealthy)
//   never_run — scheduled/continuous agent that has no run on record (unhealthy)
//   idle      — on-demand agent, not currently running (healthy — waiting for a trigger)
//   ready     — on-demand agent that has never run (healthy — registered, awaiting first trigger)
export type AgentHealth = 'ok' | 'overdue' | 'never_run' | 'idle' | 'ready';

export interface ClassifiedAgent {
  agent: string;
  mode: 'scheduled' | 'on-demand' | 'continuous';
  status: AgentHealth;
  lastSeen: string | null;
  ageMinutes: number | null;
  dueInMinutes: number | null; // scheduled only: minutes until (or past, if negative) overdue
  ok: boolean | null;
  recentErrors: number;
  stale: boolean; // true only when the agent's state should degrade the fleet
}

export interface FleetClassification {
  agents: ClassifiedAgent[];
  overdueIds: string[]; // scheduled/continuous agents that are overdue or never-run
  fleetOk: boolean;     // false iff any agent is overdue/never-run
}

/**
 * Classify each agent by cadence. On-demand agents are never "stale" — they're
 * idle/ready by design. Scheduled/continuous agents are "overdue" only once they
 * pass cadenceMinutes + graceMinutes without a run (or have never run at all).
 * This is what makes an idle daily agent not count as a fleet outage.
 */
export function classifyFleet(
  rows: AgentRow[],
  agents: AgentRuntimeCfg[],
  nowMs: number,
): FleetClassification {
  const byId = new Map(rows.map((r) => [r.id, r]));

  const classified: ClassifiedAgent[] = agents.map((cfg) => {
    const r = byId.get(cfg.id);
    const hasRun = r != null && r.last_run != null;
    const ageMinutes = hasRun ? (nowMs - new Date(r!.last_run as string).getTime()) / 60000 : null;
    const lastSeen = hasRun ? new Date(r!.last_run as string).toISOString() : null;
    const recentErrors = Number(r?.recent_errors ?? 0);
    const okFlag = r?.ok ?? null;

    // On-demand: healthy whether or not it has ever run.
    if (cfg.mode === 'on-demand') {
      return {
        agent: cfg.id, mode: cfg.mode,
        status: hasRun ? 'idle' : 'ready',
        lastSeen, ageMinutes: ageMinutes == null ? null : Math.round(ageMinutes),
        dueInMinutes: null, ok: okFlag, recentErrors, stale: false,
      };
    }

    // Scheduled / continuous: judged against cadence + grace.
    const budget = (cfg.cadenceMinutes ?? 1440) + cfg.graceMinutes;
    if (!hasRun) {
      return {
        agent: cfg.id, mode: cfg.mode, status: 'never_run',
        lastSeen: null, ageMinutes: null, dueInMinutes: null,
        ok: okFlag, recentErrors, stale: true,
      };
    }
    const overdue = (ageMinutes as number) > budget;
    return {
      agent: cfg.id, mode: cfg.mode,
      status: overdue ? 'overdue' : 'ok',
      lastSeen, ageMinutes: Math.round(ageMinutes as number),
      dueInMinutes: Math.round(budget - (ageMinutes as number)),
      ok: okFlag, recentErrors, stale: overdue,
    };
  });

  const overdueIds = classified.filter((a) => a.stale).map((a) => a.agent);
  return { agents: classified, overdueIds, fleetOk: overdueIds.length === 0 };
}

/** Render a single Prometheus metric block (HELP + TYPE + samples). */
export function promBlock(name: string, help: string, type: string, samples: string[]): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${samples.join('\n')}\n`;
}
