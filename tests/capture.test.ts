import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptureNote } from '../lib/capture.ts';

// 2026-07-23T18:30:45Z = 11:30:45 PDT
const NOW = new Date('2026-07-23T18:30:45Z');

test('buildCaptureNote: path is inbox/capture-YYYYMMDD-HHmmss.md', () => {
  const { path } = buildCaptureNote('an idea', 'charles', NOW);
  assert.match(path, /^inbox\/capture-\d{8}-\d{6}\.md$/);
});

test('buildCaptureNote: filename is Pacific time, not UTC', () => {
  const { path } = buildCaptureNote('an idea', 'charles', NOW);
  assert.equal(path, 'inbox/capture-20260723-113045.md');
});

test('buildCaptureNote: seconds make near-simultaneous captures distinct', () => {
  const a = buildCaptureNote('first', 'charles', NOW);
  const b = buildCaptureNote('second', 'charles', new Date(NOW.getTime() + 1000));
  assert.notEqual(a.path, b.path);
});

test('buildCaptureNote: frontmatter carries provenance, body preserves text', () => {
  const text = 'call the card shop about the TCGAuto demo\nsecond line';
  const { content, commitMessage } = buildCaptureNote(text, 'charles', NOW);
  assert.ok(content.startsWith('---\n'));
  assert.match(content, /^source: discord$/m);
  assert.match(content, /^via: charles$/m);
  assert.match(content, /^tags: \[inbox\]$/m);
  assert.match(content, /^captured: 2026-07-23T18:30:45/m);
  assert.ok(content.includes(text));
  assert.ok(commitMessage.startsWith('capture: call the card shop'));
});

test('buildCaptureNote: text starting with --- stays below the closing delimiter', () => {
  const { content } = buildCaptureNote('--- not frontmatter', 'charles', NOW);
  const fmEnd = content.indexOf('\n---\n');
  assert.ok(fmEnd > 0);
  assert.ok(content.indexOf('--- not frontmatter') > fmEnd);
});
