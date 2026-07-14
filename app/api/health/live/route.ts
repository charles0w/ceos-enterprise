import { NextResponse } from 'next/server';

// LIVENESS probe: "is the process up and serving?" — deliberately does NOT touch
// Postgres/KV, so an orchestrator won't kill a pod just because a dependency is
// briefly down (that's readiness's job at /api/health). Always 200 while the
// event loop is alive. Cheap enough for a tight container HEALTHCHECK interval.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(
    { status: 'alive', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
