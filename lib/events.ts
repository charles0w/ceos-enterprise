import { sql } from '@vercel/postgres';

// ── fleet_events — the real system log ────────────────────────
// One row per thing that actually happened: an agent report, a recorded
// profit, a CEO delegation, a task status change, a Sunday brief. The
// dashboard's System log panel and the hero's Events·24h / throughput
// chart read this — nothing on the home surface is fabricated anymore.

export type EventSev = 'ok' | 'info' | 'warn' | 'err';

export interface FleetEvent {
  agentId: string;
  sev: EventSev;
  message: string;
  ts: string;
}

export interface EventFeed {
  events: FleetEvent[];     // newest first
  count24: number;          // events in the last 24h
  hourly: number[];         // 24 buckets, oldest → newest (events/hr)
  profit24: number;         // realized profit recorded in the last 24h (USD)
}

async function ensureTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS fleet_events (
      id         BIGSERIAL PRIMARY KEY,
      agent_id   TEXT NOT NULL,
      sev        TEXT NOT NULL DEFAULT 'info',
      message    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

// Best-effort append — event logging must never break the operation that
// emitted it. Prunes >30-day rows opportunistically (tiny table, cheap).
export async function logEvent(agentId: string, sev: EventSev, message: string): Promise<void> {
  try {
    await ensureTable();
    await sql`
      INSERT INTO fleet_events (agent_id, sev, message)
      VALUES (${agentId}, ${sev}, ${message.slice(0, 200)})
    `;
    if (Math.random() < 0.05) {
      await sql`DELETE FROM fleet_events WHERE created_at < now() - interval '30 days'`;
    }
  } catch {
    /* never throw from the log path */
  }
}

export async function getEventFeed(limit = 14): Promise<EventFeed> {
  try {
    await ensureTable();
    const [recent, day, buckets, profit] = await Promise.all([
      sql`SELECT agent_id, sev, message, created_at FROM fleet_events ORDER BY id DESC LIMIT ${limit}`,
      sql`SELECT COUNT(*) AS n FROM fleet_events WHERE created_at > now() - interval '24 hours'`,
      sql`
        SELECT FLOOR(EXTRACT(EPOCH FROM (now() - created_at)) / 3600)::int AS hours_ago, COUNT(*) AS n
        FROM fleet_events
        WHERE created_at > now() - interval '24 hours'
        GROUP BY 1
      `,
      sql`SELECT COALESCE(SUM(amount), 0) AS total FROM profit_events WHERE occurred_at > now() - interval '24 hours'`
        .catch(() => ({ rows: [{ total: 0 }] })),
    ]);
    const hourly = Array(24).fill(0);
    for (const r of buckets.rows) {
      const idx = 23 - Number(r.hours_ago); // oldest → newest
      if (idx >= 0 && idx < 24) hourly[idx] = Number(r.n);
    }
    return {
      events: recent.rows.map((r) => ({
        agentId: r.agent_id,
        sev: (['ok', 'info', 'warn', 'err'].includes(r.sev) ? r.sev : 'info') as EventSev,
        message: r.message,
        ts: new Date(r.created_at).toISOString(),
      })),
      count24: Number(day.rows[0].n),
      hourly,
      profit24: Number(profit.rows[0].total),
    };
  } catch {
    return { events: [], count24: 0, hourly: Array(24).fill(0), profit24: 0 };
  }
}
