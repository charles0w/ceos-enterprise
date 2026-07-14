-- Backing table for fleet self-reporting. Agents POST a row per run; the health
-- and metrics endpoints read the latest row per agent. If your schema already
-- tracks runs, adapt the column names in app/api/health/route.ts + metrics/route.ts
-- instead of creating this table.

CREATE TABLE IF NOT EXISTS agent_runs (
  id          BIGSERIAL PRIMARY KEY,
  agent       TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'ok',   -- ok | error | running
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path is "latest run per agent" and "runs in last 24h" — index for it.
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_time
  ON agent_runs (agent, created_at DESC);
