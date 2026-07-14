export interface Agent {
  id: string;
  name: string;
  role: string;
  ownerRepo: string;
  skills: string[];
  schedule: string;
  // ── Runtime cadence (optional, backward-compatible) ──────────
  // Lets health distinguish "overdue" from merely "idle" so on-demand agents
  // aren't flagged degraded just for not running.
  //   scheduled  — runs on a cadence; overdue if it misses cadenceMinutes + grace
  //   on-demand  — only runs when triggered (button / hook / queue); never overdue
  //   continuous — expected always-fresh (rare); overdue past a short grace
  mode?: 'scheduled' | 'on-demand' | 'continuous';
  cadenceMinutes?: number; // expected interval between runs (scheduled / continuous)
  graceMinutes?: number;   // slack past cadence before "overdue"
}

// One headline number an agent reports for its dashboard card (max 3 shown).
// money → "$2.8k"; signed → "+1.8%" (silver) / "-0.4%" (red); unit appended.
export interface AgentMetric {
  label: string;
  value: number;
  unit?: string;
  money?: boolean;
  signed?: boolean;
}

export interface AgentStatus {
  state: 'ok' | 'warn' | 'error';
  lastRun: string;
  summary: string;
  ok: boolean;
  // ── Structured card data (optional, backward-compatible) ────
  // metrics: up to 3 headline numbers; progress: 0..1 through the
  // current task (drives the card's progress bar — omitted means the
  // dashboard derives a stable placeholder).
  metrics?: AgentMetric[];
  progress?: number;
  // ── Eval layer (optional, backward-compatible) ──────────────
  // A run that merely *completed* sets ok=true. These fields say whether
  // the output was actually any GOOD. Populated by reporter/ceo_report.py's
  // judge() + track_reliability(). Criteria live in the vault eval KB
  // (research/ai-evals/kb). All optional so legacy reports still validate.
  evalScore?: number;        // 0..1 — LLM-as-judge quality score for this run
  evalReliability?: number;  // 0..1 — recent pass-rate (pass^k-style consistency)
  evalSummary?: string;      // one-line judge rationale
}

export interface AgentWithStatus {
  agent: Agent;
  status: AgentStatus | null;
}

// ── Eval history (time-series, append-only) ──────────────────
// eval_runs accumulates every scored run; this is the per-agent series the
// dashboard charts and the cron rolls up. See lib/evals.ts.
export interface AgentTrend {
  agentId: string;
  points: number[];      // chronological quality scores (0..1), oldest → newest
  avg: number | null;
  delta: number | null;  // recent-half avg minus older-half avg (drift signal)
}
