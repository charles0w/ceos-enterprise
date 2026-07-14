import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHealth } from '../scripts/monitor.mjs';
import { selectStale } from '../scripts/runbook-restart-stale.mjs';

const healthyBody = {
  status: 'healthy',
  checks: [{ name: 'postgres', ok: true }, { name: 'kv', ok: true }, { name: 'fleet', ok: true }],
  agents: [{ agent: 'jobs', ageMinutes: 3, stale: false }],
};

test('evaluateHealth: healthy 200 within budget → no problems', () => {
  const r = evaluateHealth({ httpStatus: 200, body: healthyBody, latencyMs: 120, budgetMs: 2000 });
  assert.equal(r.degraded, false);
  assert.deepEqual(r.problems, []);
});

test('evaluateHealth: 503 status is flagged', () => {
  const r = evaluateHealth({ httpStatus: 503, body: { status: 'degraded', checks: [], agents: [] }, latencyMs: 50, budgetMs: 2000 });
  assert.equal(r.degraded, true);
  assert.match(r.problems.join(' '), /status=503/);
});

test('evaluateHealth: latency over budget is flagged', () => {
  const r = evaluateHealth({ httpStatus: 200, body: healthyBody, latencyMs: 5000, budgetMs: 2000 });
  assert.equal(r.degraded, true);
  assert.match(r.problems.join(' '), /latency=5000ms/);
});

test('evaluateHealth: stale agent + failed check are both reported', () => {
  const body = {
    status: 'degraded',
    checks: [{ name: 'postgres', ok: true }, { name: 'fleet', ok: false }],
    agents: [{ agent: 'jobs', ageMinutes: 47, stale: true }],
  };
  const r = evaluateHealth({ httpStatus: 503, body, latencyMs: 100, budgetMs: 2000 });
  const joined = r.problems.join(' ');
  assert.match(joined, /stale agents: jobs\(47m\)/);
  assert.match(joined, /failed checks: fleet/);
});

test('selectStale: filters to stale agents only', () => {
  const body = { agents: [
    { agent: 'jobs', stale: true }, { agent: 'growth', stale: false }, { agent: 'social', stale: true },
  ] };
  assert.deepEqual(selectStale(body).map((a) => a.agent), ['jobs', 'social']);
});

test('selectStale: tolerates missing agents array', () => {
  assert.deepEqual(selectStale({}), []);
  assert.deepEqual(selectStale(null), []);
});
