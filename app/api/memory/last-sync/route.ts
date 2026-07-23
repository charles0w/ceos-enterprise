import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { LAST_SYNC_KEY, type LastSync } from '@/lib/contextAge';

// When the ai-memory vault mirror last synced (stamped by /api/memory/sync).
// Public like /api/monitor/state — a timestamp and a note count carry nothing
// sensitive, and the dashboard header polls this for the CTX chip.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const stamp = await kv.get<LastSync>(LAST_SYNC_KEY).catch(() => null);
  return NextResponse.json(stamp ?? { at: null, notes: null }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
