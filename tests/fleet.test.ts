import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFleet, promBlock, type AgentRuntimeCfg } from '../lib/health.ts';

const NOW = Date.parse('2026-07-14T12:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

const scheduled = (id: string, cadence = 1440, grace = 240): AgentRuntimeCfg =>
  ({ id, mode: 'scheduled', cadenceMinutes: cadence, graceMinutes: grace });
const onDemand = (id: string): AgentRuntimeCfg => ({ id, mode: 'on-demand', cadenceMinutes: null, graceMinutes: 60 });

test('scheduled agent within cadence → ok, not stale', () => {
  const r = classifyFleet([{ id: 'finance', last_run: minsAgo(60), ok: true }], [scheduled('finance')], NOW);
  assert.equal(r.fleetOk, true);
  assert.equal(r.agents[0].status, 'ok');
  assert.equal(r.agents[0].stale, false);
});

test('scheduled agent past cadence + grace → overdue, degrades fleet', () => {
  // daily (1440) + 240 grace = 1680m budget; 2000m since last run → overdue
  const r = classifyFleet([{ id: 'finance', last_run: minsAgo(2000), ok: true }], [scheduled('finance')], NOW);
  assert.equal(r.fleetOk, false);
  assert.deepEqual(r.overdueIds, ['finance']);
  assert.equal(r.agents[0].status, 'overdue');
});

test('scheduled boundary: exactly at budget is still ok (strictly greater is overdue)', () => {
  const r = classifyFleet([{ id: 'x', last_run: minsAgo(1680), ok: true }], [scheduled('x', 1440, 240)], NOW);
  assert.equal(r.agents[0].status, 'ok');
  assert.equal(r.fleetOk, true);
});

test('scheduled agent that never ran → never_run, degrades fleet', () => {
  const r = classifyFleet([], [scheduled('growth')], NOW);
  assert.equal(r.agents[0].status, 'never_run');
  assert.equal(r.fleetOk, false);
});

test('on-demand agent with an OLD last run → idle, does NOT degrade fleet (the key fix)', () => {
  const r = classifyFleet([{ id: 'jobs', last_run: minsAgo(5000), ok: true }], [onDemand('jobs')], NOW);
  assert.equal(r.agents[0].status, 'idle');
  assert.equal(r.agents[0].stale, false);
  assert.equal(r.fleetOk, true);
});

test('on-demand agent that never ran → ready, not stale', () => {
  const r = classifyFleet([], [onDemand('hobbies')], NOW);
  assert.equal(r.agents[0].status, 'ready');
  assert.equal(r.fleetOk, true);
});

test('mixed fleet: one overdue scheduled among idle on-demand → only the scheduled degrades', () => {
  const rows = [
    { id: 'commerce', last_run: minsAgo(200), ok: true },   // scheduled hourly-ish → overdue
    { id: 'jobs', last_run: minsAgo(9000), ok: true },      // on-demand → idle
  ];
  const cfgs = [scheduled('commerce', 60, 30), onDemand('jobs')];
  const r = classifyFleet(rows, cfgs, NOW);
  assert.deepEqual(r.overdueIds, ['commerce']);
  assert.equal(r.fleetOk, false);
});

test('dueInMinutes is negative once overdue, positive while healthy', () => {
  const healthy = classifyFleet([{ id: 'a', last_run: minsAgo(100), ok: true }], [scheduled('a', 1440, 240)], NOW);
  assert.ok((healthy.agents[0].dueInMinutes ?? 0) > 0);
  const late = classifyFleet([{ id: 'a', last_run: minsAgo(2000), ok: true }], [scheduled('a', 1440, 240)], NOW);
  assert.ok((late.agents[0].dueInMinutes ?? 0) < 0);
});

test('promBlock: well-formed exposition', () => {
  const out = promBlock('ceos_up', 'reachable', 'gauge', ['ceos_up 1']);
  assert.match(out, /# HELP ceos_up reachable/);
  assert.match(out, /# TYPE ceos_up gauge/);
  assert.match(out, /ceos_up 1/);
});
