import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextAge, contextAgeWarning } from '../lib/contextAge.ts';

const NOW = Date.parse('2026-07-23T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

test('contextAge: under 24h is fresh', () => {
  const s = contextAge(hoursAgo(23.9), NOW);
  assert.equal(s.level, 'fresh');
  assert.ok(s.hours != null && s.hours > 23 && s.hours < 24);
});

test('contextAge: past 24h is stale', () => {
  assert.equal(contextAge(hoursAgo(24.1), NOW).level, 'stale');
});

test('contextAge: past 72h is critical', () => {
  assert.equal(contextAge(hoursAgo(72.1), NOW).level, 'critical');
});

test('contextAge: null and garbage timestamps are unknown', () => {
  assert.deepEqual(contextAge(null, NOW), { level: 'unknown', hours: null });
  assert.deepEqual(contextAge(undefined, NOW), { level: 'unknown', hours: null });
  assert.deepEqual(contextAge('not-a-date', NOW), { level: 'unknown', hours: null });
});

test('contextAgeWarning: silent when fresh', () => {
  assert.equal(contextAgeWarning(contextAge(hoursAgo(1), NOW), hoursAgo(1)), null);
});

test('contextAgeWarning: stale includes hour count, timestamp, and remediation', () => {
  const at = hoursAgo(31);
  const msg = contextAgeWarning(contextAge(at, NOW), at);
  assert.ok(msg != null);
  assert.match(msg, /31h stale/);
  assert.ok(msg.includes(at));
  assert.match(msg, /sync-db\.mjs --push/);
});

test('contextAgeWarning: never-synced still warns with remediation', () => {
  const msg = contextAgeWarning(contextAge(null, NOW), null);
  assert.ok(msg != null);
  assert.match(msg, /never synced/);
  assert.match(msg, /sync-db\.mjs --push/);
});
