import { NextResponse } from 'next/server';
import { getEventFeed } from '@/lib/events';

export const dynamic = 'force-dynamic';

// The real system log + 24h activity stats for the dashboard's refresh
// cycle. Session-gated by middleware.
export async function GET() {
  return NextResponse.json(await getEventFeed());
}
