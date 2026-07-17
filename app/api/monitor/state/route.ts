import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

// Tiny KV-backed memory for the synthetic monitor (scripts/monitor.mjs), which
// runs stateless in GitHub Actions every 10 minutes. Storing the last observed
// status here lets the monitor alert on TRANSITIONS (healthy→degraded,
// degraded→healthy) instead of re-paging Discord on every degraded poll.
//
// GET  → { status, since, updatedAt }   (public — carries no sensitive data)
// PUT  → { status: 'healthy'|'degraded' }  auth: x-report-secret

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KEY = 'monitor:state';

type MonitorState = { status: 'healthy' | 'degraded'; since: string; updatedAt: string };

export async function GET() {
  const state = await kv.get<MonitorState>(KEY).catch(() => null);
  return NextResponse.json(state ?? { status: 'unknown', since: null, updatedAt: null }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PUT(req: NextRequest) {
  const secret = req.headers.get('x-report-secret');
  if (!secret || secret !== process.env.REPORT_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body: { status?: string } = await req.json().catch(() => ({}));
  if (body.status !== 'healthy' && body.status !== 'degraded') {
    return NextResponse.json({ error: 'status must be healthy|degraded' }, { status: 400 });
  }
  const prev = await kv.get<MonitorState>(KEY).catch(() => null);
  const now = new Date().toISOString();
  const state: MonitorState = {
    status: body.status,
    // `since` marks when the CURRENT status began — preserved across same-status updates.
    since: prev?.status === body.status ? prev.since : now,
    updatedAt: now,
  };
  await kv.set(KEY, state);
  return NextResponse.json(state);
}
