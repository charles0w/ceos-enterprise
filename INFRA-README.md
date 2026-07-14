# CEO's Enterprise — Infrastructure & Reliability Bundle

Drop-in production-hardening for the fleet-control dashboard: containerization,
CI/CD, monitoring + alerting, config-as-code, Prometheus metrics, automated
runbooks, and a unit-test suite. **Verified against the real repo** (cloned from
`github.com/charles0w/ceos-enterprise`): typechecks clean, builds, and the
endpoints serve correctly. Wire it in, deploy, and the resume claims below are true.

## What's included

```
Dockerfile                        Multi-stage build → standalone image; HEALTHCHECK hits liveness
.dockerignore
docker-compose.yml                Local app + Postgres + Redis (mirrors Vercel prod), web healthcheck
.github/workflows/ci.yml          Lint → typecheck → unit tests → build → container build
.github/workflows/monitor.yml     Scheduled synthetic uptime + fleet probe (every 10 min) → alerts
app/api/health/route.ts           READINESS: deps + per-agent freshness → 200/503
app/api/health/live/route.ts      LIVENESS: process-only, always 200 (no DB)
app/api/metrics/route.ts          Prometheus/OpenMetrics; optional METRICS_TOKEN bearer gate
lib/health.ts                     Pure, unit-tested helpers (classifyFleet, promBlock)
scripts/monitor.mjs               Synthetic probe + latency budget + alert (exports evaluateHealth)
scripts/runbook-restart-stale.mjs Auto-remediation runbook (exports selectStale/loadPolicy) + audit log
infra/slo.yml                     Config-as-code: SLOs, per-agent budgets, remediation + alert policy
migrations/001_agent_runs.sql     Reference schema (real app already has agent_status + fleet_events)
tests/fleet.test.ts               Unit tests: classifyFleet (fresh/stale/boundary/missing) + promBlock
tests/scripts.test.mjs            Unit tests: evaluateHealth + selectStale
RUNBOOKS.md / OBSERVABILITY.md     Operational docs
```

## How it reads the real fleet

The app already persists agent self-reports in **`agent_status`** (`id, state, last_run, ok, …`,
written by `POST /api/report` via `lib/registry.ts`) and a system log in **`fleet_events`**
(`agent_id, sev, message, created_at`, via `lib/events.ts`). The health/metrics routes read
those tables directly — no new schema required. Freshness = `now() - agent_status.last_run`
vs the staleness budget; only registered agents with a real `ownerRepo` are checked.

## Integration (≈30 min) — verified steps

1. **Copy** the tree into the `ceos-enterprise` repo root (folders merge with `app/`, `lib/`, `scripts/`, `.github/`).
2. **next.config.ts** — add standalone output:
   ```ts
   const nextConfig: NextConfig = { output: 'standalone' };
   ```
3. **middleware.ts** — allowlist the probes (otherwise auth 307-redirects them to `/login`). Add to `PUBLIC_PREFIXES`:
   ```ts
   '/api/health',   // liveness/readiness — public for uptime monitors
   '/api/metrics',  // Prometheus — reachable; route enforces optional METRICS_TOKEN
   ```
4. **tsconfig.json** — add `"tests"` to `exclude` (tests run under `node --test`, not the Next build).
5. **Secrets / env:**
   - `AGENT_STALE_MINUTES` (optional, default 15)
   - `METRICS_TOKEN` (optional — if set, `/api/metrics` requires `Authorization: Bearer <token>`)
   - CI/monitor repo secrets: `HEALTH_URL`, `ALERT_WEBHOOK_URL` (Discord/Slack), optional `RETRIGGER_URL_BASE`
6. **Verify locally:**
   ```bash
   npx tsc --noEmit
   node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs   # 11 tests
   docker compose up --build
   curl -s localhost:3000/api/health | jq        # 503 until DB is reachable, then 200
   curl -s localhost:3000/api/health/live         # 200 alive
   ```
7. **Commit & push** → CI runs; `monitor.yml` starts probing on schedule.

## Verification status (already run against the clone)

- [x] `npx tsc --noEmit` — clean
- [x] `next build` — compiles `/api/health`, `/api/health/live`, `/api/metrics`
- [x] 11/11 unit tests pass (`fleet.test.ts` + `scripts.test.mjs`)
- [x] Live probe: `/api/health/live` → **200**; `/api/health` → **503** (correct, no DB) with per-dependency diagnostics
- [x] `/api/metrics` → **401** without token, **200** with `Bearer` token
- [x] Middleware allowlist verified (was 307→/login before the fix)
- [x] Healthy-path SQL (JOIN + interval window + stale detection) validated against the real schema via in-memory Postgres
- [x] `monitor.mjs` + `runbook-restart-stale.mjs` behavior validated end-to-end (healthy / degraded / alert / auto-remediate)

## Known follow-ups (honest gaps)

- **Auto-retrigger endpoint:** `runbook-restart-stale.mjs` needs a per-agent re-run URL (`RETRIGGER_URL_BASE`, e.g. `POST /api/agents/{agent}/run`). That endpoint doesn't exist yet — until it's built, the runbook detects + **escalates** (alerts) rather than auto-restarting. Building it is the next step to close the loop.
- **Alert flap suppression:** the monitor alerts on every failed probe; add state-file dedup if pages get noisy.
- **Status page UI:** `/api/health` is JSON-only; a small `/status` page could render it.

## What you can now truthfully put on the resume

> Hardened a live multi-agent dashboard (Next.js/Vercel, Postgres/KV) for production: containerized with a multi-stage **Docker** build, added a **GitHub Actions CI/CD** pipeline (lint, typecheck, **unit tests**, build, image), split **liveness/readiness** health probes, **Prometheus** metrics with a token gate, and a scheduled **synthetic uptime/latency monitor** with on-call alerting; codified SLOs and per-agent heartbeat budgets as **config-as-code** and wrote an **automated runbook** that detects stale agents and escalates. Refactored decision logic into pure, unit-tested modules (11 tests).
