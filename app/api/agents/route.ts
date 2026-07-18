import { NextRequest, NextResponse } from 'next/server';
import { getFleet } from '@/lib/registry';

export const dynamic = 'force-dynamic';

// Dual-auth mirrors /api/agents/[id]/run and /api/tasks: x-report-secret
// (machine/external dashboard) OR fleet_session cookie (the dashboard UI).
// Read-only route, so an external Mission Control can pull fleet data with the
// report secret while browser sessions keep using the cookie.
function authorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-report-secret');
  if (secret && process.env.REPORT_SECRET && secret === process.env.REPORT_SECRET) return true;
  const session = req.cookies.get('fleet_session')?.value;
  const expected = process.env.FLEET_PASSWORD ?? '';
  return !!expected && session === expected;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const fleet = await getFleet();
  return NextResponse.json(fleet);
}
