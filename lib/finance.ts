import { sql } from '@vercel/postgres';

// The ai-trading-bot ("finance" agent) pushes a single latest snapshot here
// (POST /api/finance) every daily run. The /finance trading-desk page reads it.
// Deep detail lives on Charles's Mac; this is the online mirror.

export interface FinancePrediction {
  id: string;
  date: string;
  symbol: string;
  direction: string;            // "up" | "down"
  horizon_days: number;
  entry_ref: number;
  conviction?: number | null;
  status: string;               // "open" | "graded"
  correct?: boolean | null;
  return_pct?: number | null;
}

export interface FinancePosition {
  occ_symbol: string;
  quantity: number;
  entry_price: number;
  mark?: number | null;
  entry_at_utc?: string | null;
}

export interface FinanceScorecard {
  n_total: number;
  n_graded: number;
  hit_rate: number | null;
  expectancy_pct: number | null;
  brier: number | null;
}

export interface FinanceCandidate {
  symbol: string;
  days_since_earnings?: number | null;
  sue?: number | null;
  post_earnings_return?: number | null;
  in_window?: boolean;
}

export interface FinanceUpcoming {
  symbol: string;
  date: string;                 // YYYY-MM-DD
  hour?: string | null;         // "bmo" | "amc" | ...
  eps_estimate?: number | null;
}

export interface FinanceSnapshot {
  updatedAt: string | null;
  model: Record<string, unknown> | null;     // {version, held_out_acc, weights, ...}
  scorecard: FinanceScorecard | null;
  predictions: FinancePrediction[];
  positions: FinancePosition[];
  candidates: FinanceCandidate[];
  upcoming: FinanceUpcoming[];                // forward: liquid names reporting this week
  note: string | null;                        // e.g. last run summary
}

// One daily-launch record for the activity log (click a day to see its summary).
export interface FinanceRun {
  ts: string;
  ok: boolean;
  summary: string;
  detail: string;
}

function empty(): FinanceSnapshot {
  return { updatedAt: null, model: null, scorecard: null, predictions: [], positions: [], candidates: [], upcoming: [], note: null };
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS finance_snapshot (
      id TEXT PRIMARY KEY,
      model JSONB,
      scorecard JSONB,
      predictions JSONB,
      positions JSONB,
      candidates JSONB,
      note TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`ALTER TABLE finance_snapshot ADD COLUMN IF NOT EXISTS upcoming JSONB`;
  await sql`
    CREATE TABLE IF NOT EXISTS finance_runs (
      id SERIAL PRIMARY KEY,
      ts TIMESTAMPTZ DEFAULT now(),
      ok BOOLEAN DEFAULT true,
      summary TEXT,
      detail TEXT
    )
  `;
}

export async function getFinanceRuns(limit = 30): Promise<FinanceRun[]> {
  try {
    await ensureTable();
    const { rows } = await sql`
      SELECT ts, ok, summary, detail FROM finance_runs ORDER BY ts DESC LIMIT ${limit}
    `;
    return rows.map((r) => ({
      ts: r.ts, ok: r.ok, summary: r.summary ?? '', detail: r.detail ?? '',
    }));
  } catch {
    return [];
  }
}

export async function appendFinanceRun(run: { ok?: boolean; summary?: string; detail?: string }): Promise<void> {
  await ensureTable();
  await sql`
    INSERT INTO finance_runs (ok, summary, detail)
    VALUES (${run.ok ?? true}, ${run.summary ?? null}, ${run.detail ? run.detail.slice(0, 8000) : null})
  `;
}

export async function getFinanceSnapshot(): Promise<FinanceSnapshot> {
  try {
    await ensureTable();
    const { rows } = await sql`SELECT * FROM finance_snapshot WHERE id = 'latest'`;
    if (!rows.length) return empty();
    const r = rows[0];
    return {
      updatedAt: r.updated_at ?? null,
      model: r.model ?? null,
      scorecard: r.scorecard ?? null,
      predictions: r.predictions ?? [],
      positions: r.positions ?? [],
      candidates: r.candidates ?? [],
      upcoming: r.upcoming ?? [],
      note: r.note ?? null,
    };
  } catch {
    return empty();
  }
}

export async function upsertFinanceSnapshot(p: Partial<FinanceSnapshot>): Promise<void> {
  await ensureTable();
  // Mirror registry.ts: pass JSON strings into JSONB columns (@vercel/postgres casts).
  const j = (v: unknown) => (v == null ? null : JSON.stringify(v));
  await sql`
    INSERT INTO finance_snapshot (id, model, scorecard, predictions, positions, candidates, upcoming, note, updated_at)
    VALUES ('latest', ${j(p.model)}, ${j(p.scorecard)}, ${j(p.predictions ?? [])},
            ${j(p.positions ?? [])}, ${j(p.candidates ?? [])}, ${j(p.upcoming ?? [])}, ${p.note ?? null}, now())
    ON CONFLICT (id) DO UPDATE SET
      model = EXCLUDED.model,
      scorecard = EXCLUDED.scorecard,
      predictions = EXCLUDED.predictions,
      positions = EXCLUDED.positions,
      candidates = EXCLUDED.candidates,
      upcoming = EXCLUDED.upcoming,
      note = EXCLUDED.note,
      updated_at = now()
  `;
}
