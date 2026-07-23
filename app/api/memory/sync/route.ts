import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { kv } from '@vercel/kv';
import { upsertMemory, type MemoryNote } from '@/lib/aiMemory';
import { LAST_SYNC_KEY } from '@/lib/contextAge';

export const dynamic = 'force-dynamic';

// Bridge between the local Obsidian ai-memory vault and the Postgres mirror the
// deployed CEO reads. The vault's sync-db.mjs script calls this.
//   POST { notes: [...] }  → upsert vault notes into ai_memory (push: vault → DB)
//   GET  ?since=ISO        → return CEO-authored notes (pull: DB → vault)
// Auth: x-report-secret header === REPORT_SECRET (same machine-to-machine secret
// the fleet status reporter uses). Not in PUBLIC_PREFIXES, but the secret check
// is the real gate here.

function authed(req: NextRequest): boolean {
  const secret = req.headers.get('x-report-secret');
  return !!secret && secret === process.env.REPORT_SECRET;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { notes?: Partial<MemoryNote>[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const notes = body.notes ?? [];
  let upserted = 0;
  for (const n of notes) {
    if (!n.slug || !n.title) continue;
    await upsertMemory({
      slug: n.slug,
      title: n.title,
      body: n.body ?? '',
      kind: n.kind ?? 'core',
      links: n.links ?? [],
      tags: n.tags ?? [],
      source: 'vault',
    });
    upserted++;
  }
  // Freshness stamp for the dashboard chip + digest warning. Any authed POST
  // means the sync pipeline ran (sync-db.mjs pushes the whole tree each time),
  // so stamp even when upserted === 0. Best-effort: KV being down must never
  // fail the sync itself.
  await kv
    .set(LAST_SYNC_KEY, { at: new Date().toISOString(), notes: upserted })
    .catch(() => {});
  return NextResponse.json({ ok: true, upserted });
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { rows } = await sql`
      SELECT slug, title, kind, body, links, tags, source, updated_at
      FROM ai_memory WHERE source = 'ceo' ORDER BY updated_at DESC
    `;
    return NextResponse.json({ notes: rows });
  } catch {
    return NextResponse.json({ notes: [] });
  }
}
