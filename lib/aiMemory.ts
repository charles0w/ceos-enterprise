import { sql } from '@vercel/postgres';
import { pushVaultFile } from './vaultGit';
import { rankNotes, type RankedNote } from './rank';

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

// Ranked search over the memory graph, using the same scoring as the local
// recall.mjs (term frequency + title/tag weight; see lib/rank.ts). Pulls a
// bounded candidate set and ranks in-process — the graph is small (a personal
// brain), so this is both cheap and higher quality than a flat ILIKE order.
// Returns RankedNote[] (a superset of MemoryNote — the extra score/snippet are
// harmless to callers that only need MemoryNote fields, e.g. the CEO tool).
export async function searchMemory(query: string, limit = 6): Promise<RankedNote[]> {
  try {
    await ensureTable();
    const { rows } = await sql`
      SELECT slug, title, kind, left(body, 4000) AS body, links, tags, source, updated_at
      FROM ai_memory
      LIMIT 5000
    `;
    return rankNotes(rows.map(rowToNote), query, limit);
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

// ── CEO session log ──────────────────────────────────────────────────────────
// Every prompt to the CEO is recorded two ways: an append-only ceo_log row
// (raw audit), and a rolling daily `sessions/<date>` note in ai_memory so the
// prompts live in the graph (recallable, visible in the graph view, synced to
// the vault under ai-memory/sessions/).

export async function logCeoSession(prompt: string, reply: string): Promise<void> {
  await ensureTable();
  const now = new Date();
  const day = now.toISOString().slice(0, 10);          // YYYY-MM-DD
  const time = now.toISOString().slice(11, 16);         // HH:MM (UTC)
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS ceo_log (
        id BIGSERIAL PRIMARY KEY,
        prompt TEXT NOT NULL,
        reply TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`INSERT INTO ceo_log (prompt, reply) VALUES (${prompt}, ${reply})`;

    const slug = `sessions/${day}`;
    const existing = await getMemory(slug);
    const header = `> [!summary] Log of prompts to the [[CEO Orchestrator]] on ${day} (UTC).`;
    // body has no leading "# title" — the title column holds it; the vault file
    // (DB sync and the GitHub push) prepend "# <title>" uniformly.
    const base = existing?.body ?? `${header}\n`;
    const entry = `\n## ${time}\n\n**Prompt:** ${prompt.slice(0, 1000)}\n\n**CEO:** ${reply.slice(0, 1000)}\n`;
    await upsertMemory({
      slug,
      title: `CEO session — ${day}`,
      kind: 'session',
      body: base + entry,
      tags: ['ai-memory', 'session'],
      links: ['CEO Orchestrator'],
      source: 'ceo',
    });
  } catch {
    // logging is best-effort; never block the chat response
  }
}

// ── Graph data for the on-site visualization ─────────────────────────────────
export interface GraphNode { id: string; title: string; kind: string; degree: number }
export interface GraphLink { source: string; target: string }
export interface GraphData { nodes: GraphNode[]; links: GraphLink[] }

// Resolve a [[wikilink]] target (a title, a slug, or a path) to a node slug.
function resolveTarget(target: string, byKey: Map<string, string>): string | null {
  const t = target.trim();
  const candidates = [
    t.toLowerCase(),
    t.split('/').pop()!.toLowerCase(),               // basename
    t.replace(/^.*\//, '').replace(/\.md$/, '').toLowerCase(),
  ];
  for (const c of candidates) if (byKey.has(c)) return byKey.get(c)!;
  return null;
}

export async function getGraph(): Promise<GraphData> {
  await ensureTable();
  try {
    const { rows } = await sql`SELECT slug, title, kind, links FROM ai_memory`;
    const byKey = new Map<string, string>();
    for (const r of rows) {
      const slug = String(r.slug);
      byKey.set(slug.toLowerCase(), slug);
      byKey.set(String(r.title).toLowerCase(), slug);
      byKey.set(slug.split('/').pop()!.toLowerCase(), slug);
    }
    const degree = new Map<string, number>();
    const seen = new Set<string>();
    const links: GraphLink[] = [];
    for (const r of rows) {
      const from = String(r.slug);
      for (const raw of ((r.links as string[]) ?? [])) {
        const to = resolveTarget(raw, byKey);
        if (!to || to === from) continue;
        const key = from < to ? `${from}|${to}` : `${to}|${from}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ source: from, target: to });
        degree.set(from, (degree.get(from) ?? 0) + 1);
        degree.set(to, (degree.get(to) ?? 0) + 1);
      }
    }
    const nodes: GraphNode[] = rows.map((r) => ({
      id: String(r.slug),
      title: String(r.title),
      kind: String(r.kind),
      degree: degree.get(String(r.slug)) ?? 0,
    }));
    return { nodes, links };
  } catch {
    return { nodes: [], links: [] };
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

  // CEO-authored notes (session logs, append_memory learnings) are committed to
  // the vault's GitHub repo so every session is pushed + updates ai-memory there.
  // Best-effort: a missing GITHUB_TOKEN or API hiccup never breaks the chat.
  if (source === 'ceo') {
    const rel = note.slug.includes('/') ? note.slug : `learnings/${note.slug}`;
    const file = `---\ntags: [${tags.join(', ')}]\nsource: ceo\n---\n\n# ${note.title}\n\n${note.body}\n`;
    try {
      const res = await pushVaultFile(`ai-memory/${rel}.md`, file, `CEO: update ${note.slug}`);
      if (res.ok) console.log(`[vaultGit] pushed ai-memory/${rel}.md`);
      else console.error(`[vaultGit] push FAILED for ai-memory/${rel}.md — ${res.error}`);
    } catch (e) {
      console.error('[vaultGit] push threw', String(e)); // best-effort; never breaks chat
    }
  }
}
