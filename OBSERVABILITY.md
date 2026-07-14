# Observability

How the CEO's Enterprise fleet is monitored, and how to build on it.

## Signals

| Signal | Source | Use |
|---|---|---|
| Liveness + dependency health | `GET /api/health` | container HEALTHCHECK, synthetic probe |
| Fleet freshness (per-agent heartbeat age) | `GET /api/health` → `agents[]` | detect dead/hung agents |
| Prometheus metrics | `GET /api/metrics` | Grafana dashboards, alert rules |
| Synthetic uptime + latency | `scripts/monitor.mjs` (every 10 min) | availability & latency SLO |
| Structured audit log | `runbook-restart-stale.mjs` JSON lines | incident forensics |

## Exported metrics

- `ceos_up` — dashboard reachable (1/0)
- `ceos_agent_runs_total{agent}` — runs in last 24h
- `ceos_agent_errors_total{agent}` — errored runs in last 24h
- `ceos_agent_heartbeat_age_seconds{agent}` — seconds since last report

## Example Prometheus alert rules

```yaml
groups:
  - name: ceos-fleet
    rules:
      - alert: CeosDown
        expr: ceos_up == 0
        for: 2m
        labels: { severity: page }
      - alert: AgentStale
        expr: ceos_agent_heartbeat_age_seconds > 900
        for: 5m
        labels: { severity: warn }
```

## SLOs

Defined in [`infra/slo.yml`](infra/slo.yml): 99.5% availability (30d), p95 health latency < 2s, 99% fleet freshness. The synthetic monitor is the availability data source; error budget burn is the trigger to pause risky deploys.
