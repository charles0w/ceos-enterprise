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

export interface FinanceSnapshot {
  updatedAt: string | null;
  model: Record<string, unknown> | null;     // {version, held_out_acc, weights, ...}
  scorecard: FinanceScorecard | null;
  predictions: FinancePrediction[];
  positions: FinancePosition[];
  candidates: FinanceCandidate[];
  note: string | null;                        // e.g. last run summary
}

function empty(): FinanceSnapshot {
  return { updatedAt: null, model: null, scorecard: null, predictions: [], positions: [], candidates: [], note: null };
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
    INSERT INTO finance_snapshot (id, model, scorecard, predictions, positions, candidates, note, updated_at)
    VALUES ('latest', ${j(p.model)}, ${j(p.scorecard)}, ${j(p.predictions ?? [])},
            ${j(p.positions ?? [])}, ${j(p.candidates ?? [])}, ${p.note ?? null}, now())
    ON CONFLICT (id) DO UPDATE SET
      model = EXCLUDED.model,
      scorecard = EXCLUDED.scorecard,
      predictions = EXCLUDED.predictions,
      positions = EXCLUDED.positions,
      candidates = EXCLUDED.candidates,
      note = EXCLUDED.note,
      updated_at = now()
  `;
}
