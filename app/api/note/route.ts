import { NextRequest, NextResponse } from 'next/server';
import { getMemory } from '@/lib/aiMemory';

export const dynamic = 'force-dynamic';

// Full contents of one memory note by slug — for the graph sidebar.
// Session-gated by middleware (browser sends fleet_session cookie).
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const note = await getMemory(slug);
  if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(note);
}
