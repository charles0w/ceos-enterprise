import { NextResponse } from 'next/server';
import { getGraph } from '@/lib/aiMemory';

export const dynamic = 'force-dynamic';

// Nodes + links for the on-site knowledge-graph visualization (/graph).
// Session-gated by middleware (not in PUBLIC_PREFIXES) — the browser sends the
// fleet_session cookie, so authenticated operators get the data.
export async function GET() {
  const graph = await getGraph();
  return NextResponse.json(graph);
}
