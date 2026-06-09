# Agent context — ceos-enterprise

This repo is the **CEO OS fleet control plane** — the Next.js dashboard where every fleet agent self-reports status, plus the **CEO orchestrator** (`/ceo`, Opus 4.8) that reads the shared AI-memory graph, inspects the live fleet, and delegates tasks.

## Shared AI memory

The human-facing graph is the Obsidian vault at:

```
/Users/charlesow/Desktop/obi-secondbrain/ai-memory/
```

The deployed CEO can't read those local files, so they are synced into the Postgres `ai_memory` table (`lib/aiMemory.ts`) via `ai-memory/scripts/sync-db.mjs` → `POST /api/memory/sync` (guarded by `REPORT_SECRET`). The CEO's tools (`lib/ceo.ts`) read/append that table and `delegate_task` writes to `fleet_tasks`.

**Required env**: `ANTHROPIC_API_KEY` (CEO), `REPORT_SECRET` (sync + status), `POSTGRES_URL` (auto on Vercel).

To pull context locally: `node /Users/charlesow/Desktop/obi-secondbrain/ai-memory/scripts/recall.mjs "<query>"`.
