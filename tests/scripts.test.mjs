import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHealth, decideAlert, suggestActions } from '../scripts/monitor.mjs';
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

test('evaluateHealth: never-run agent prints "never ran", not nullm', () => {
  const body = { status: 'degraded', checks: [], agents: [{ agent: 'finance', ageMinutes: null, stale: true }] };
  const r = evaluateHealth({ httpStatus: 503, body, latencyMs: 100, budgetMs: 2000 });
  assert.match(r.problems.join(' '), /finance\(never ran\)/);
});

test('decideAlert: pages only on healthy→degraded transition', () => {
  assert.equal(decideAlert('healthy', true), 'page');
  assert.equal(decideAlert('unknown', true), 'page');
  assert.equal(decideAlert('degraded', true), 'none');   // already alerted — stay quiet
});

test('decideAlert: recovers only on degraded→healthy transition', () => {
  assert.equal(decideAlert('degraded', false), 'recover');
  assert.equal(decideAlert('healthy', false), 'none');
  assert.equal(decideAlert('unknown', false), 'none');
});

test('suggestActions: one /run per stale agent + a /direct hint', () => {
  const lines = suggestActions({ agents: [
    { agent: 'commerce', stale: true }, { agent: 'growth', stale: true }, { agent: 'finance', stale: false },
  ] }).join('\n');
  assert.match(lines, /\/run commerce/);
  assert.match(lines, /\/run growth/);
  assert.doesNotMatch(lines, /\/run finance/);
  assert.match(lines, /\/direct commerce/);
});

test('suggestActions: generic steering line when nothing is stale', () => {
  const lines = suggestActions({ agents: [] }).join('\n');
  assert.match(lines, /\/fleet/);
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
