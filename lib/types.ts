export interface Agent {
  id: string;
  name: string;
  role: string;
  ownerRepo: string;
  skills: string[];
  schedule: string;
}

export interface AgentStatus {
  state: 'ok' | 'warn' | 'error';
  lastRun: string;
  summary: string;
  ok: boolean;
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
