import { sql } from '@vercel/postgres';
import type { EditPlan, PostCopy } from './plan';

// Social Studio persistence. Files are LOCAL-FIRST (they live in the browser's
// OPFS, never uploaded) — Postgres only mirrors metadata, transcripts, plans
// and chat so the studio state survives reloads and is visible fleet-wide.

export interface SocialAssetRow {
  id: string;
  name: string;
  kind: 'video' | 'image' | 'audio';
  mime: string | null;
  size_bytes: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  thumb: string | null;          // small data-URL preview (<= ~16KB)
  transcript: Transcript | null;
  notes: string | null;
  cloud_url: string | null;      // Cloudinary backup — renderable from any device
  created_at: string;
}

export interface TranscriptSegment { start: number; end: number; text: string }
export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  source: string;
}

export interface SocialReferenceRow {
  id: string;
  url: string | null;
  title: string | null;
  author: string | null;
  provider: string | null;
  thumb_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface SocialProjectRow {
  id: string;
  title: string;
  plan: EditPlan | null;
  messages: unknown[];   // client chat view-model, capped
  status: string;
  output: Record<string, unknown> | null;
  post_copy: PostCopy | null;
  updated_at: string;
}

let ensured = false;
export async function ensureSocialTables(): Promise<void> {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS social_assets (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      kind        TEXT NOT NULL,
      mime        TEXT,
      size_bytes  BIGINT,
      duration    REAL,
      width       INT,
      height      INT,
      thumb       TEXT,
      transcript  JSONB,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE social_assets ADD COLUMN IF NOT EXISTS cloud_url TEXT`;
  await sql`
    CREATE TABLE IF NOT EXISTS social_references (
      id          TEXT PRIMARY KEY,
      url         TEXT,
      title       TEXT,
      author      TEXT,
      provider    TEXT,
      thumb_url   TEXT,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS social_projects (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT 'Untitled cut',
      plan        JSONB,
      messages    JSONB NOT NULL DEFAULT '[]',
      status      TEXT NOT NULL DEFAULT 'draft',
      output      JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE social_projects ADD COLUMN IF NOT EXISTS post_copy JSONB DEFAULT NULL`;
  ensured = true;
}

// ── assets ────────────────────────────────────────────────────
export async function listAssets(): Promise<SocialAssetRow[]> {
  await ensureSocialTables();
  const { rows } = await sql`SELECT * FROM social_assets ORDER BY created_at DESC LIMIT 200`;
  return rows as unknown as SocialAssetRow[];
}

export async function upsertAsset(a: {
  id: string; name: string; kind: string; mime?: string | null; sizeBytes?: number | null;
  duration?: number | null; width?: number | null; height?: number | null; thumb?: string | null;
  notes?: string | null; cloudUrl?: string | null;
}): Promise<void> {
  await ensureSocialTables();
  await sql`
    INSERT INTO social_assets (id, name, kind, mime, size_bytes, duration, width, height, thumb, notes, cloud_url)
    VALUES (${a.id}, ${a.name}, ${a.kind}, ${a.mime ?? null}, ${a.sizeBytes ?? null},
            ${a.duration ?? null}, ${a.width ?? null}, ${a.height ?? null}, ${a.thumb ?? null}, ${a.notes ?? null},
            ${a.cloudUrl ?? null})
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, mime = EXCLUDED.mime, size_bytes = EXCLUDED.size_bytes,
      duration = COALESCE(EXCLUDED.duration, social_assets.duration),
      width = COALESCE(EXCLUDED.width, social_assets.width),
      height = COALESCE(EXCLUDED.height, social_assets.height),
      thumb = COALESCE(EXCLUDED.thumb, social_assets.thumb),
      notes = COALESCE(EXCLUDED.notes, social_assets.notes),
      cloud_url = COALESCE(EXCLUDED.cloud_url, social_assets.cloud_url)
  `;
}

export async function setAssetTranscript(id: string, transcript: Transcript): Promise<void> {
  await ensureSocialTables();
  await sql`UPDATE social_assets SET transcript = ${JSON.stringify(transcript)}::jsonb WHERE id = ${id}`;
}

export async function deleteAsset(id: string): Promise<void> {
  await ensureSocialTables();
  await sql`DELETE FROM social_assets WHERE id = ${id}`;
}

// ── references ────────────────────────────────────────────────
export async function listReferences(): Promise<SocialReferenceRow[]> {
  await ensureSocialTables();
  const { rows } = await sql`SELECT * FROM social_references ORDER BY created_at DESC LIMIT 100`;
  return rows as unknown as SocialReferenceRow[];
}

export async function upsertReference(r: {
  id: string; url?: string | null; title?: string | null; author?: string | null;
  provider?: string | null; thumbUrl?: string | null; notes?: string | null;
}): Promise<void> {
  await ensureSocialTables();
  await sql`
    INSERT INTO social_references (id, url, title, author, provider, thumb_url, notes)
    VALUES (${r.id}, ${r.url ?? null}, ${r.title ?? null}, ${r.author ?? null},
            ${r.provider ?? null}, ${r.thumbUrl ?? null}, ${r.notes ?? null})
    ON CONFLICT (id) DO UPDATE SET
      url = EXCLUDED.url,
      title = COALESCE(EXCLUDED.title, social_references.title),
      author = COALESCE(EXCLUDED.author, social_references.author),
      provider = COALESCE(EXCLUDED.provider, social_references.provider),
      thumb_url = COALESCE(EXCLUDED.thumb_url, social_references.thumb_url),
      notes = COALESCE(EXCLUDED.notes, social_references.notes)
  `;
}

export async function deleteReference(id: string): Promise<void> {
  await ensureSocialTables();
  await sql`DELETE FROM social_references WHERE id = ${id}`;
}

// ── projects ──────────────────────────────────────────────────
export async function getProject(id: string): Promise<SocialProjectRow | null> {
  await ensureSocialTables();
  const { rows } = await sql`SELECT * FROM social_projects WHERE id = ${id}`;
  return (rows[0] as unknown as SocialProjectRow) ?? null;
}

export async function listProjects(): Promise<SocialProjectRow[]> {
  await ensureSocialTables();
  const { rows } = await sql`
    SELECT id, title, status, output, updated_at, plan, '[]'::jsonb AS messages
    FROM social_projects ORDER BY updated_at DESC LIMIT 50
  `;
  return rows as unknown as SocialProjectRow[];
}

export async function upsertProject(p: {
  id: string; title?: string; plan?: EditPlan | null; messages?: unknown[];
  status?: string; output?: Record<string, unknown> | null; postCopy?: PostCopy | null;
}): Promise<void> {
  await ensureSocialTables();
  const messages = JSON.stringify((p.messages ?? []).slice(-60));
  await sql`
    INSERT INTO social_projects (id, title, plan, messages, status, output, post_copy)
    VALUES (${p.id}, ${p.title ?? 'Untitled cut'}, ${p.plan ? JSON.stringify(p.plan) : null}::jsonb,
            ${messages}::jsonb, ${p.status ?? 'draft'}, ${p.output ? JSON.stringify(p.output) : null}::jsonb,
            ${p.postCopy ? JSON.stringify(p.postCopy) : null}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      title = COALESCE(${p.title ?? null}, social_projects.title),
      plan = COALESCE(${p.plan ? JSON.stringify(p.plan) : null}::jsonb, social_projects.plan),
      messages = CASE WHEN ${p.messages !== undefined} THEN ${messages}::jsonb ELSE social_projects.messages END,
      status = COALESCE(${p.status ?? null}, social_projects.status),
      output = COALESCE(${p.output ? JSON.stringify(p.output) : null}::jsonb, social_projects.output),
      post_copy = COALESCE(${p.postCopy ? JSON.stringify(p.postCopy) : null}::jsonb, social_projects.post_copy),
      updated_at = now()
  `;
}

export async function deleteProject(id: string): Promise<void> {
  await ensureSocialTables();
  await sql`DELETE FROM social_projects WHERE id = ${id}`;
}
