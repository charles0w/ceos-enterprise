import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';
import { promBlock } from '@/lib/health';

// Prometheus-compatible metrics for the fleet, sourced from the real tables:
// fleet_events (runs / errors in 24h) and fleet_agent_status (heartbeat age).
// Scrape at /api/metrics. Optionally gated by METRICS_TOKEN (Bearer).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = process.env.METRICS_TOKEN;
  if (token && req.headers.get('authorization') !== `Bearer ${token}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  let body = '';
  try {
    const [events, status] = await Promise.all([
      sql`
        SELECT agent_id,
               COUNT(*)                            AS runs,
               COUNT(*) FILTER (WHERE sev = 'err') AS errors
        FROM fleet_events
        WHERE created_at > now() - interval '24 hours'
        GROUP BY agent_id
      `,
      sql`SELECT id, EXTRACT(EPOCH FROM (now() - last_run)) AS heartbeat_age_s FROM fleet_agent_status`,
    ]);

    const runs = events.rows.map((r) => `ceos_agent_runs_total{agent="${r.agent_id}"} ${r.runs}`);
    const errs = events.rows.map((r) => `ceos_agent_errors_total{agent="${r.agent_id}"} ${r.errors}`);
    const age = status.rows.map(
      (r) => `ceos_agent_heartbeat_age_seconds{agent="${r.id}"} ${Math.round(Number(r.heartbeat_age_s))}`,
    );

    body += promBlock('ceos_agent_runs_total', 'Agent events in the last 24h', 'counter', runs);
    body += promBlock('ceos_agent_errors_total', 'Agent error events in the last 24h', 'counter', errs);
    body += promBlock('ceos_agent_heartbeat_age_seconds', 'Seconds since agent last reported', 'gauge', age);
    body += promBlock('ceos_up', 'Dashboard reachable', 'gauge', ['ceos_up 1']);
  } catch {
    body += promBlock('ceos_up', 'Dashboard reachable', 'gauge', ['ceos_up 0']);
  }

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; version=0.0.4', 'Cache-Control': 'no-store' },
  });
}
