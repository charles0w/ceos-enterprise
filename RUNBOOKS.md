# CEO's Enterprise — Operational Runbooks

Operational procedures for running the fleet-control dashboard in production.
Policy thresholds live in [`infra/slo.yml`](infra/slo.yml); most of these runbooks
are automated by scripts referenced below.

## Health model

- **Liveness / dependencies / fleet freshness:** `GET /api/health` → `200` healthy, `503` degraded.
- **Metrics:** `GET /api/metrics` (Prometheus/OpenMetrics).
- **Synthetic probe & alerting:** `scripts/monitor.mjs`, scheduled by `.github/workflows/monitor.yml` (every 10 min).

## Fleet model: scheduled vs on-demand

Agents carry a `mode` in `lib/agents.ts`. **Scheduled** agents run on a cadence and go
`overdue` if they miss `cadenceMinutes + graceMinutes`. **On-demand** agents (e.g. `jobs`,
`hobbies`) only run when triggered and are never "overdue" — they show `idle`/`ready`.
So `/api/health` = `degraded` means a *scheduled* agent missed its window, not that an idle
agent hasn't run. `/api/health` returns each agent's `status` and `dueInMinutes`.

## Trigger an on-demand run (pull queue)

`POST /api/agents/{id}/run` enqueues a run-request onto the delegation queue
(`fleet_tasks`). The agent picks it up next time it polls via `reporter/fleet_tasks.py`
(`GET /api/tasks?agentId={id}&status=queued`) — nothing runs 24/7. Same endpoint is the
webhook target for any external trigger.

```bash
# from a machine / hook (x-report-secret), or the dashboard "Run" button (session cookie)
curl -X POST https://ceos-enterprise.vercel.app/api/agents/jobs/run \
  -H "x-report-secret: $REPORT_SECRET" \
  -H "content-type: application/json" \
  -d '{"reason":"manual kick"}'
# → { "queued": true, "agent": "jobs", "taskId": 42, "status": "queued" }
```

## Runbook: Agent is overdue (scheduled agent missed its window)

**Symptom:** `/api/health` reports `503` with a stale agent, or a Discord alert fires.

**Automated remediation (preferred):**
```bash
HEALTH_URL=https://ceos-enterprise.vercel.app/api/health \
RETRIGGER_URL_BASE=https://ceos-enterprise.vercel.app/api/agents/{agent}/run \
ALERT_WEBHOOK_URL=$DISCORD_WEBHOOK \
node scripts/runbook-restart-stale.mjs
```
The script retries within `remediation.stale_agent` limits and escalates to Discord only if auto-recovery fails. Every action is written as a structured JSON audit line.

**Manual fallback:** re-run the agent from its own repo, then confirm `ageMinutes` resets on the next `/api/health` poll.

## Runbook: Dashboard unreachable

1. Check the latest `monitor.yml` run — `UNREACHABLE` means DNS/deploy failure.
2. Verify the Vercel deployment is live; roll back to the last green deploy if a bad build shipped.
3. Confirm `POSTGRES_URL` / `KV_URL` env vars are present in the Vercel project.

## Runbook: Latency budget breach

1. `/api/health` `latencyMs` over `slos.latency.p95_budget_ms` → check Postgres/KV latency in the `checks[]` array.
2. Inspect slow queries against `agent_runs`; ensure an index on `(agent, created_at)`.

## Runbook: Local reproduction

```bash
docker compose up --build   # app + Postgres + Redis, mirrors prod topology
curl -s localhost:3000/api/health | jq
```

## Deploy / rollback

- CI (`ci.yml`) gates every push: lint → typecheck → test → build → container build.
- Production deploys via Vercel Git integration on `main`.
- Rollback = promote the previous deployment in the Vercel dashboard (no rebuild).
