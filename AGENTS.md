# Agent context — ceos-enterprise

This repo is the **CEO OS fleet control plane** — the Next.js dashboard where every fleet agent self-reports status, plus the **CEO orchestrator** (`/ceo`, Opus 4.8) that reads the shared AI-memory graph, inspects the live fleet, and delegates tasks.

## Shared AI memory

The human-facing graph is the Obsidian vault at:

```
/Users/charlesow/Desktop/obi-secondbrain/ai-memory/
```

The deployed CEO can't read those local files, so they are synced into the Postgres `ai_memory` table (`lib/aiMemory.ts`) via `ai-memory/scripts/sync-db.mjs` → `POST /api/memory/sync` (guarded by `REPORT_SECRET`). The CEO's tools (`lib/ceo.ts`) read/append that table and `delegate_task` writes to `fleet_tasks`.

Each CEO session is also auto-committed to the vault's GitHub repo via the Contents API (`lib/vaultGit.ts`), so every prompt is pushed to GitHub + updates `ai-memory/sessions/` without a local machine.

## Reporting (fleet repos → dashboard)

Agents report via `POST /api/report` (header `x-report-secret`) — client: `reporter/ceo_report.py`. Beyond `status` (state/summary/ok + eval fields), reports may carry:

- `status.metrics` — up to 3 `{label, value, unit?, money?, signed?}` shown on the agent's card
- `status.progress` — 0..1 through the current task (drives the card's progress bar)
- top-level `profit: { amount, note? }` — **realized** profit/loss in USD, appended once per win to the `profit_events` ledger. The Garage panel = (ledger + Growth's `closed_amount` sums) / target prices (`lib/garage.ts`). Agent profit only — never send on routine heartbeats.

## Delegation queue

The CEO's `delegate_task` writes to `fleet_tasks`; the dashboard shows them in the Delegations panel. Agents service their queue via `/api/tasks` (same `x-report-secret`):
`GET /api/tasks?agentId=<id>&status=queued` → pick up work, then `PATCH /api/tasks {id, status: "in_progress" | "done" | "dropped"}`.

**Required env**: `ANTHROPIC_API_KEY` (CEO), `REPORT_SECRET` (sync + status), `POSTGRES_URL` (auto on Vercel), `GITHUB_TOKEN` (fine-grained PAT, Contents:write on `obi-secondbrain` — enables the session auto-push).

To pull context locally: `node /Users/charlesow/Desktop/obi-secondbrain/ai-memory/scripts/recall.mjs "<query>"`.
