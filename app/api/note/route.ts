import { NextRequest, NextResponse } from 'next/server';
import { getMemory } from '@/lib/aiMemory';

export const dynamic = 'force-dynamic';

// Full contents of one memory note by slug — for the graph sidebar.
// Session-gated by middleware (browser sends fleet_session cookie).
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  // getMemory is a parameterized Postgres lookup (no filesystem access), so this
  // is defense-in-depth, not a traversal guard: bound length and reject '..' /
  // control chars while still allowing real slugs (which contain spaces, dots, '/').
  if (slug.length > 200 || slug.includes('..') || /[^A-Za-z0-9 ._/-]/.test(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }
  const note = await getMemory(slug);
  if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(note);
}
