import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorized } from '../lib/auth.ts';

// authorized() is structurally typed, so plain stubs work.
function stubReq(headers: Record<string, string>, cookies: Record<string, string>) {
  return {
    headers: { get: (n: string) => headers[n] ?? null },
    cookies: { get: (n: string) => (cookies[n] != null ? { value: cookies[n] } : undefined) },
  };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('authorized: matching x-report-secret passes', () => {
  withEnv({ REPORT_SECRET: 's3cret', FLEET_PASSWORD: 'pw' }, () => {
    assert.equal(authorized(stubReq({ 'x-report-secret': 's3cret' }, {})), true);
  });
});

test('authorized: matching fleet_session cookie passes', () => {
  withEnv({ REPORT_SECRET: 's3cret', FLEET_PASSWORD: 'pw' }, () => {
    assert.equal(authorized(stubReq({}, { fleet_session: 'pw' })), true);
  });
});

test('authorized: wrong secret and wrong cookie fail', () => {
  withEnv({ REPORT_SECRET: 's3cret', FLEET_PASSWORD: 'pw' }, () => {
    assert.equal(authorized(stubReq({ 'x-report-secret': 'nope' }, { fleet_session: 'nope' })), false);
  });
});

test('authorized: nothing provided fails', () => {
  withEnv({ REPORT_SECRET: 's3cret', FLEET_PASSWORD: 'pw' }, () => {
    assert.equal(authorized(stubReq({}, {})), false);
  });
});

test('authorized: unset REPORT_SECRET never matches an empty header', () => {
  withEnv({ REPORT_SECRET: undefined, FLEET_PASSWORD: 'pw' }, () => {
    assert.equal(authorized(stubReq({ 'x-report-secret': '' }, {})), false);
    assert.equal(authorized(stubReq({}, { fleet_session: 'pw' })), true);
  });
});

test('authorized: unset FLEET_PASSWORD never matches an empty cookie', () => {
  withEnv({ REPORT_SECRET: 's3cret', FLEET_PASSWORD: undefined }, () => {
    assert.equal(authorized(stubReq({}, { fleet_session: '' })), false);
  });
});
