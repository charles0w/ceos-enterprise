import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFleet, promBlock } from '../lib/health.ts';

const NOW = Date.parse('2026-07-12T12:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

test('classifyFleet: all fresh → fleetOk', () => {
  const rows = [
    { id: 'jobs', last_run: minsAgo(3), ok: true },
    { id: 'growth', last_run: minsAgo(9), ok: true },
  ];
  const r = classifyFleet(rows, ['jobs', 'growth'], NOW, 15);
  assert.equal(r.fleetOk, true);
  assert.deepEqual(r.staleIds, []);
  assert.equal(r.agents.find((a) => a.agent === 'jobs')!.ageMinutes, 3);
});

test('classifyFleet: one stale → not ok, listed', () => {
  const rows = [
    { id: 'jobs', last_run: minsAgo(47), ok: true },
    { id: 'growth', last_run: minsAgo(2), ok: true },
  ];
  const r = classifyFleet(rows, ['jobs', 'growth'], NOW, 15);
  assert.equal(r.fleetOk, false);
  assert.deepEqual(r.staleIds, ['jobs']);
});

test('classifyFleet: threshold boundary is inclusive (exactly at budget = fresh)', () => {
  const rows = [{ id: 'jobs', last_run: minsAgo(15), ok: true }];
  const r = classifyFleet(rows, ['jobs'], NOW, 15);
  assert.equal(r.fleetOk, true, '15m with 15m budget should be fresh');
});

test('classifyFleet: agent that never reported (no row) is stale', () => {
  const r = classifyFleet([], ['jobs'], NOW, 15);
  assert.equal(r.fleetOk, false);
  assert.equal(r.agents[0].lastSeen, null);
  assert.equal(r.agents[0].stale, true);
});

test('promBlock: well-formed exposition', () => {
  const out = promBlock('ceos_up', 'reachable', 'gauge', ['ceos_up 1']);
  assert.match(out, /# HELP ceos_up reachable/);
  assert.match(out, /# TYPE ceos_up gauge/);
  assert.match(out, /ceos_up 1/);
});
