import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isQuietRepeat } from '../lib/quiet.ts';
import type { AgentStatus } from '../lib/types.ts';

const base: AgentStatus = {
  state: 'ok',
  lastRun: '2026-07-17T01:00:00Z',
  summary: 'fulfillment tick clean · 1 CEO task(s) queued',
  ok: true,
  metrics: [
    { label: 'Fulfilled · tick', value: 0 },
    { label: 'GMV · tick', value: 0, money: true },
  ],
};

test('isQuietRepeat: identical ok repeat is quiet', () => {
  const next = { ...base, lastRun: '2026-07-17T02:00:00Z' };
  assert.equal(isQuietRepeat(base, next), true);
});

test('isQuietRepeat: metrics equal despite key reordering (JSONB) is quiet', () => {
  const prevFromDb = {
    ...base,
    metrics: [
      { value: 0, label: 'Fulfilled · tick' },
      { money: true, value: 0, label: 'GMV · tick' },
    ],
  } as AgentStatus;
  assert.equal(isQuietRepeat(prevFromDb, base), true);
});

test('isQuietRepeat: changed summary is news', () => {
  assert.equal(isQuietRepeat(base, { ...base, summary: '1 order fulfilled' }), false);
});

test('isQuietRepeat: changed metric value is news', () => {
  const next = { ...base, metrics: [{ label: 'Fulfilled · tick', value: 2 }, { label: 'GMV · tick', value: 40, money: true }] };
  assert.equal(isQuietRepeat(base, next), false);
});

test('isQuietRepeat: warn/error state is always news', () => {
  assert.equal(isQuietRepeat(base, { ...base, state: 'error' }), false);
  assert.equal(isQuietRepeat({ ...base, state: 'warn' }, base), false);
});

test('isQuietRepeat: profit is always news', () => {
  assert.equal(isQuietRepeat(base, base, { amount: 12.5 }), false);
  assert.equal(isQuietRepeat(base, base, { amount: 0 }), true); // zero profit = not news
});

test('isQuietRepeat: first-ever report is news', () => {
  assert.equal(isQuietRepeat(null, base), false);
});
