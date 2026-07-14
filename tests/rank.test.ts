import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankNotes } from '../lib/rank.ts';

const note = (over: Partial<{ slug: string; title: string; body: string; tags: string[]; updatedAt: string }>) => ({
  slug: over.slug ?? 's',
  title: over.title ?? '',
  kind: 'core',
  body: over.body ?? '',
  links: [],
  tags: over.tags ?? [],
  source: 'vault',
  updatedAt: over.updatedAt ?? '2026-01-01T00:00:00Z',
});

test('title match outranks body-only match', () => {
  const notes = [
    note({ slug: 'body', title: 'Something', body: 'strategy appears once here' }),
    note({ slug: 'title', title: 'Strategy notes', body: 'unrelated' }),
  ];
  const r = rankNotes(notes, 'strategy', 6);
  assert.equal(r[0].slug, 'title', 'title weight (×5) should win');
});

test('term frequency increases score', () => {
  const notes = [
    note({ slug: 'few', body: 'jobs' }),
    note({ slug: 'many', body: 'jobs jobs jobs jobs' }),
  ];
  const r = rankNotes(notes, 'jobs', 6);
  assert.equal(r[0].slug, 'many');
  assert.ok(r[0].score > r[1].score);
});

test('tag match contributes score', () => {
  const r = rankNotes([note({ slug: 't', body: 'nothing relevant', tags: ['fleet'] })], 'fleet', 6);
  assert.equal(r.length, 1);
  assert.ok(r[0].score >= 3);
});

test('zero-score notes are dropped', () => {
  const r = rankNotes([note({ slug: 'x', title: 'Cats', body: 'dogs' })], 'quantum', 6);
  assert.deepEqual(r, []);
});

test('multi-word query sums per-word scores', () => {
  const notes = [
    note({ slug: 'one', body: 'jobs' }),
    note({ slug: 'both', body: 'jobs and strategy together' }),
  ];
  const r = rankNotes(notes, 'jobs strategy', 6);
  assert.equal(r[0].slug, 'both');
});

test('limit is respected and snippet is built around the hit', () => {
  const notes = Array.from({ length: 10 }, (_, i) => note({ slug: `n${i}`, body: 'alpha '.repeat(i + 1) }));
  const r = rankNotes(notes, 'alpha', 3);
  assert.equal(r.length, 3);
  assert.ok(typeof r[0].snippet === 'string' && r[0].snippet.includes('alpha'));
});

test('empty query returns nothing', () => {
  assert.deepEqual(rankNotes([note({ body: 'x' })], '   ', 6), []);
});
