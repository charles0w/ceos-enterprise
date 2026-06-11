import { sql } from '@vercel/postgres';

// ── The Garage — funded by agent profit only ──────────────────
// Every target's progress = (total profit the fleet has earned) / price.
// Profit comes from exactly two places:
//   1. profit_events — append-only ledger rows posted by agents through
//      POST /api/report { profit: { amount, note } } (x-report-secret authed).
//   2. Growth's closed deals — SUM(closed_amount) from the businesses table
//      (already the canonical record for that agent; never double-reported).
// No savings, no manual top-ups: the bars only move when the fleet earns.

export interface GarageTarget {
  id: string;
  label: string;
  sub: string;
  img?: string;
  price: number;     // USD — edit here as targets/prices change
  progress: number;  // 0..1 = totalProfit / price
}

export interface GarageData {
  total: number;        // all agent profit to date, USD
  fromGrowth: number;   // closed-deal revenue (businesses table)
  fromLedger: number;   // reported profit events (all other agents)
  targets: GarageTarget[];
}

const TARGETS: Omit<GarageTarget, 'progress'>[] = [
  { id: '812',    label: 'Ferrari 812 Superfast', sub: 'Rosso Corsa',        price: 400_000 },
  { id: 'm4',     label: 'BMW M4 Competition',    sub: 'first key',          price: 85_000, img: '/assets/m-logo.png' },
  { id: 'studio', label: 'Highrise studio',       sub: 'floor 40+, skyline', price: 150_000 },
];

async function ensureLedger(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS profit_events (
      id          BIGSERIAL PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      amount      NUMERIC NOT NULL,
      note        TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

// Append one realized profit (or loss — negative amount) to the ledger.
export async function recordProfit(agentId: string, amount: number, note?: string): Promise<void> {
  await ensureLedger();
  await sql`
    INSERT INTO profit_events (agent_id, amount, note)
    VALUES (${agentId}, ${amount}, ${note ?? null})
  `;
}

export async function getGarage(): Promise<GarageData | null> {
  try {
    await ensureLedger();
    const [ledger, growth] = await Promise.all([
      sql`SELECT COALESCE(SUM(amount), 0) AS total FROM profit_events`,
      sql`SELECT COALESCE(SUM(closed_amount), 0) AS total FROM businesses WHERE closed_amount IS NOT NULL`
        .catch(() => ({ rows: [{ total: 0 }] })), // businesses table may not exist yet
    ]);
    const fromLedger = Number(ledger.rows[0].total);
    const fromGrowth = Number(growth.rows[0].total);
    const total = fromLedger + fromGrowth;
    return {
      total,
      fromGrowth,
      fromLedger,
      targets: TARGETS.map((t) => ({ ...t, progress: Math.min(1, total / t.price) })),
    };
  } catch {
    return null; // DB unreachable — the dashboard falls back gracefully
  }
}
