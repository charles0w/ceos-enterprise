#!/usr/bin/env node
// One-off recovery for the 2026-06→07 status split-brain: the shared DB's
// `agent_status` became an external VIEW (over agents+runs), our INSERTs
// silently failed, and six weeks of statuses landed only in KV. This script:
//   1. creates the dashboard's new `fleet_agent_status` table,
//   2. backfills it from the freshest KV `agent:status:<id>` entries,
//   3. inserts missing `agents` rows + a fresh `runs` row per agent so the
//      external agent_status view stops reporting June data.
// Safe to re-run (idempotent upserts). Run: node --env-file=.env.local scripts/backfill-fleet-status.mjs

import { sql } from '@vercel/postgres';
import { kv } from '@vercel/kv';

const AGENT_IDS = ['commerce', 'finance', 'lambos-trader', 'growth', 'social', 'school', 'jobs', 'hobbies'];

await sql`
  CREATE TABLE IF NOT EXISTS fleet_agent_status (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    last_run TIMESTAMPTZ NOT NULL,
    summary TEXT NOT NULL,
    ok BOOLEAN NOT NULL,
    eval_score REAL,
    eval_reliability REAL,
    eval_summary TEXT,
    metrics JSONB,
    progress REAL,
    updated_at TIMESTAMPTZ DEFAULT now()
  )
`;
console.log('fleet_agent_status table ready');

for (const id of AGENT_IDS) {
  const s = await kv.get(`agent:status:${id}`);
  if (!s || !s.lastRun) {
    console.log(`${id}: no KV status — skipped`);
    continue;
  }
  await sql`
    INSERT INTO fleet_agent_status (id, state, last_run, summary, ok, eval_score, eval_reliability, eval_summary, metrics, progress, updated_at)
    VALUES (
      ${id}, ${s.state ?? 'ok'}, ${s.lastRun}, ${s.summary ?? ''}, ${s.ok ?? true},
      ${s.evalScore ?? null}, ${s.evalReliability ?? null}, ${s.evalSummary ?? null},
      ${s.metrics ? JSON.stringify(s.metrics) : null}, ${s.progress ?? null}, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      state = EXCLUDED.state, last_run = EXCLUDED.last_run, summary = EXCLUDED.summary,
      ok = EXCLUDED.ok, eval_score = EXCLUDED.eval_score, eval_reliability = EXCLUDED.eval_reliability,
      eval_summary = EXCLUDED.eval_summary, metrics = EXCLUDED.metrics, progress = EXCLUDED.progress,
      updated_at = now()
  `;
  console.log(`${id}: backfilled from KV (lastRun=${s.lastRun})`);

  // Keep the external CEO schema fresh too (best-effort).
  try {
    await sql`
      INSERT INTO agents (id, name, role, owner_repo)
      VALUES (${id}, ${id}, 'fleet agent', ${id})
      ON CONFLICT (id) DO NOTHING
    `;
    const dupe = await sql`SELECT 1 FROM runs WHERE agent_id = ${id} AND started_at = ${s.lastRun} LIMIT 1`;
    if (!dupe.rows.length) {
      await sql`
        INSERT INTO runs (agent_id, state, summary, ok, started_at, ended_at)
        VALUES (${id}, ${s.state ?? 'ok'}, ${s.summary ?? ''}, ${s.ok ?? true}, ${s.lastRun}, ${s.lastRun})
      `;
      console.log(`${id}: mirrored into runs`);
    }
  } catch (e) {
    console.warn(`${id}: runs mirror skipped — ${e.message}`);
  }
}

const check = await sql`SELECT id, last_run FROM fleet_agent_status ORDER BY last_run DESC`;
console.log('--- fleet_agent_status now ---');
for (const r of check.rows) console.log(r.id, r.last_run);
process.exit(0);
