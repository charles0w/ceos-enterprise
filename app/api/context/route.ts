import { NextRequest, NextResponse } from 'next/server';
import { searchMemory, getMemory, listMemory } from '@/lib/aiMemory';

// Unified CONTEXT API for the fleet. One place every agent — cloud (Vercel /
// GitHub Actions) or local — reads Charles's living context from the Postgres
// mirror of the Obsidian ai-memory vault (kept in sync by ai-memory/scripts/
// sync-db.mjs). Read-only projection; the vault stays the source of truth.
//
//   GET /api/context?q=<query>[&limit=n]   → ranked note snippets (search)
//   GET /api/context?slug=<slug>           → one full note
//   GET /api/context?list[=kind]           → index of notes (optionally by kind)
//
// Auth: x-report-secret (agents/hooks) OR fleet_session cookie (dashboard),
// mirroring /api/tasks. Allowlisted in middleware; the check below is the gate.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-report-secret');
  if (secret && process.env.REPORT_SECRET && secret === process.env.REPORT_SECRET) return true;
  const session = req.cookies.get('fleet_session')?.value;
  const expected = process.env.FLEET_PASSWORD ?? '';
  return !!expected && session === expected;
}

// Shared with /api/note: defense-in-depth on slugs (real slugs contain spaces,
// dots, '/'), even though lookups are parameterized SQL with no filesystem access.
function badSlug(slug: string): boolean {
  return slug.length > 200 || slug.includes('..') || /[^A-Za-z0-9 ._/-]/.test(slug);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const q = p.get('q');
  const slug = p.get('slug');
  const list = p.get('list'); // '' (all) or a kind

  // 1) Fetch one full note by slug.
  if (slug !== null) {
    if (!slug || badSlug(slug)) return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
    const note = await getMemory(slug);
    if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ note }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // 2) Search for context snippets.
  if (q !== null) {
    if (!q.trim()) return NextResponse.json({ error: 'q must be non-empty' }, { status: 400 });
    const limit = Math.min(Math.max(Number(p.get('limit') ?? 6) || 6, 1), 20);
    const notes = await searchMemory(q, limit);
    const results = notes.map((n) => ({
      slug: n.slug,
      title: n.title,
      kind: n.kind,
      snippet: n.body.length > 320 ? `${n.body.slice(0, 320)}…` : n.body,
      tags: n.tags,
      updatedAt: n.updatedAt,
    }));
    return NextResponse.json({ query: q, count: results.length, results }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // 3) List the index (optionally by kind).
  if (list !== null) {
    const notes = await listMemory(list || undefined);
    return NextResponse.json({ count: notes.length, notes }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json(
    { error: 'provide one of: q (search), slug (fetch), list (index)' },
    { status: 400 },
  );
}
