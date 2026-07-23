import { NextRequest, NextResponse } from 'next/server';
import { getEventFeed } from '@/lib/events';
import { authorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// The real system log + 24h activity stats for the dashboard's refresh cycle.
// Dual-auth (lib/auth.ts): fleet_session cookie (dashboard) OR x-report-secret
// (Mission Control in Obsidian pulls this for its SYSTEM LOG strip).
// Middleware allowlists the route; this check is the gate.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await getEventFeed());
}
