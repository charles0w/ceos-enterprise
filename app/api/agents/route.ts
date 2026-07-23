import { NextRequest, NextResponse } from 'next/server';
import { getFleet } from '@/lib/registry';
import { authorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Dual-auth (lib/auth.ts): x-report-secret (machine/external dashboard) OR
// fleet_session cookie (the dashboard UI). Read-only route, so an external
// Mission Control can pull fleet data with the report secret while browser
// sessions keep using the cookie.

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const fleet = await getFleet();
  return NextResponse.json(fleet);
}
