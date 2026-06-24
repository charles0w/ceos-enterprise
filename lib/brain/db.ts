import { sql } from '@vercel/postgres';
import type { Skill, SkillInsert } from './skills';

let ensured = false;

export async function ensureSkillsTable(): Promise<void> {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS company_skills (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      trigger     TEXT NOT NULL,
      knowledge   TEXT NOT NULL,
      domain      TEXT NOT NULL DEFAULT 'internal',
      escalate    BOOLEAN NOT NULL DEFAULT false,
      confidence  REAL NOT NULL DEFAULT 0.8,
      source      TEXT NOT NULL DEFAULT 'manual',
      usage_count INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE company_skills ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`;
  await sql`ALTER TABLE company_skills ADD COLUMN IF NOT EXISTS last_fired TIMESTAMPTZ`;
  await sql`ALTER TABLE company_skills ADD COLUMN IF NOT EXISTS outcomes JSONB NOT NULL DEFAULT '{"good":0,"bad":0}'`;
  await sql`ALTER TABLE company_skills ADD COLUMN IF NOT EXISTS evidence TEXT[] NOT NULL DEFAULT '{}'`;
  ensured = true;
}

export async function listSkills(domain?: string, opts?: { includeAll?: boolean }): Promise<Skill[]> {
  await ensureSkillsTable();
  const includeAll = opts?.includeAll === true;
  let rows;
  if (domain && includeAll) {
    ({ rows } = await sql`SELECT * FROM company_skills WHERE domain = ${domain} ORDER BY domain, name`);
  } else if (domain) {
    ({ rows } = await sql`SELECT * FROM company_skills WHERE domain = ${domain} AND status = 'active' ORDER BY domain, name`);
  } else if (includeAll) {
    ({ rows } = await sql`SELECT * FROM company_skills ORDER BY domain, name`);
  } else {
    ({ rows } = await sql`SELECT * FROM company_skills WHERE status = 'active' ORDER BY domain, name`);
  }
  return rows as unknown as Skill[];
}

export async function getSkill(name: string): Promise<Skill | null> {
  await ensureSkillsTable();
  const { rows } = await sql`SELECT * FROM company_skills WHERE name = ${name}`;
  return (rows[0] as unknown as Skill) ?? null;
}

export async function upsertSkill(s: SkillInsert): Promise<Skill> {
  await ensureSkillsTable();
  const status = s.status ?? 'active';
  const lastFired = s.last_fired ?? null;
  const outcomes = JSON.stringify(s.outcomes ?? { good: 0, bad: 0 });
  const evidence = s.evidence ?? [];
  const { rows } = await sql`
    INSERT INTO company_skills (name, title, trigger, knowledge, domain, escalate, confidence, source, status, last_fired, outcomes, evidence)
    VALUES (${s.name}, ${s.title}, ${s.trigger}, ${s.knowledge}, ${s.domain}, ${s.escalate}, ${s.confidence}, ${s.source}, ${status}, ${lastFired}, ${outcomes}::jsonb, ${evidence as unknown as string}::text[])
    ON CONFLICT (name) DO UPDATE SET
      title      = EXCLUDED.title,
      trigger    = EXCLUDED.trigger,
      knowledge  = EXCLUDED.knowledge,
      domain     = EXCLUDED.domain,
      escalate   = EXCLUDED.escalate,
      confidence = EXCLUDED.confidence,
      source     = EXCLUDED.source,
      status     = EXCLUDED.status,
      last_fired = EXCLUDED.last_fired,
      outcomes   = EXCLUDED.outcomes,
      evidence   = EXCLUDED.evidence,
      updated_at = now()
    RETURNING *
  `;
  return rows[0] as unknown as Skill;
}

export async function deleteSkill(name: string): Promise<void> {
  await ensureSkillsTable();
  await sql`DELETE FROM company_skills WHERE name = ${name}`;
}

export async function incrementSkillUsage(name: string): Promise<void> {
  await ensureSkillsTable();
  await sql`UPDATE company_skills SET usage_count = usage_count + 1, updated_at = now() WHERE name = ${name}`;
}

export async function seedSkillsIfEmpty(seeds: SkillInsert[]): Promise<number> {
  await ensureSkillsTable();
  const { rows } = await sql`SELECT COUNT(*)::int AS n FROM company_skills`;
  if ((rows[0] as { n: number }).n > 0) return 0;
  let seeded = 0;
  for (const s of seeds) {
    await upsertSkill(s);
    seeded++;
  }
  return seeded;
}
