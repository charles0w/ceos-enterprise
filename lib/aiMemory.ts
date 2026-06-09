import { sql } from '@vercel/postgres';

// Shared AI-memory store for the fleet's CEO orchestrator.
//
// The human-facing source of truth is the Obsidian "ai-memory" knowledge graph
// in the obi-secondbrain vault (local files). Because the CEO runs on Vercel and
// can't read those files, the vault is synced into this Postgres `ai_memory`
// table (see ceos-jobs/.. obi-secondbrain/ai-memory/scripts/sync-db.mjs). Local
// Claude Code fleet agents read the vault directly; the deployed CEO reads here.
// The CEO can also append new memories here, which sync-db.mjs pulls back into
// the vault as new notes.

export interface MemoryNote {
  slug: string;          // stable id, e.g. 'fleet/jobs-agent'
  title: string;
  kind: string;          // core | fleet | entity | learning
  body: string;          // markdown
  links: string[];       // outgoing [[wikilink]] targets (slugs/titles)
  tags: string[];
  source: string;        // 'vault' | 'ceo'
  updatedAt: string;     // ISO
}

let _ensured = false;
async function ensureTable(): Promise<void> {
  if (_ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS ai_memory (
      slug        TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'learning',
      body        TEXT NOT NULL DEFAULT '',
      links       TEXT[] NOT NULL DEFAULT '{}',
      tags        TEXT[] NOT NULL DEFAULT '{}',
      source      TEXT NOT NULL DEFAULT 'vault',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS ai_memory_kind ON ai_memory (kind)`;
  _ensured = true;
}

function rowToNote(r: Record<string, unknown>): MemoryNote {
  return {
    slug: String(r.slug),
    title: String(r.title),
    kind: String(r.kind),
    body: String(r.body ?? ''),
    links: (r.links as string[]) ?? [],
    tags: (r.tags as string[]) ?? [],
    source: String(r.source ?? 'vault'),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : '',
  };
}

// Keyword search over title + body. Ranks title matches above body matches.
// Returns short previews; the CEO calls read_memory for the full note.
export async function searchMemory(query: string, limit = 6): Promise<MemoryNote[]> {
  await ensureTable();
  const q = `%${query.trim()}%`;
  try {
    const { rows } = await sql`
      SELECT slug, title, kind, left(body, 600) AS body, links, tags, source, updated_at
      FROM ai_memory
      WHERE title ILIKE ${q} OR body ILIKE ${q} OR ${query} = ANY(tags)
      ORDER BY (title ILIKE ${q}) DESC, updated_at DESC
      LIMIT ${limit}
    `;
    return rows.map(rowToNote);
  } catch {
    return [];
  }
}

export async function getMemory(slug: string): Promise<MemoryNote | null> {
  await ensureTable();
  try {
    const { rows } = await sql`SELECT * FROM ai_memory WHERE slug = ${slug} LIMIT 1`;
    return rows[0] ? rowToNote(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function listMemory(kind?: string): Promise<Pick<MemoryNote, 'slug' | 'title' | 'kind'>[]> {
  await ensureTable();
  try {
    const { rows } = kind
      ? await sql`SELECT slug, title, kind FROM ai_memory WHERE kind = ${kind} ORDER BY title`
      : await sql`SELECT slug, title, kind FROM ai_memory ORDER BY kind, title`;
    return rows.map((r) => ({ slug: String(r.slug), title: String(r.title), kind: String(r.kind) }));
  } catch {
    return [];
  }
}

export async function upsertMemory(
  note: Pick<MemoryNote, 'slug' | 'title' | 'body'> & Partial<MemoryNote>
): Promise<void> {
  await ensureTable();
  const kind = note.kind ?? 'learning';
  const links = note.links ?? [];
  const tags = note.tags ?? ['ai-memory', kind];
  const source = note.source ?? 'ceo';
  await sql`
    INSERT INTO ai_memory (slug, title, kind, body, links, tags, source, updated_at)
    VALUES (${note.slug}, ${note.title}, ${kind}, ${note.body}, ${links as unknown as string}, ${tags as unknown as string}, ${source}, now())
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      kind = EXCLUDED.kind,
      body = EXCLUDED.body,
      links = EXCLUDED.links,
      tags = EXCLUDED.tags,
      source = EXCLUDED.source,
      updated_at = now()
  `;
}
