import { NextRequest, NextResponse } from 'next/server';
import { upsertStatus } from '@/lib/registry';
import type { AgentStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-report-secret');
  if (!secret || secret !== process.env.REPORT_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body: { agentId: string; status: AgentStatus } = await req.json();
  if (!body.agentId || !body.status) {
    return NextResponse.json({ error: 'missing agentId or status' }, { status: 400 });
  }

  await upsertStatus(body.agentId, body.status);
  return NextResponse.json({ ok: true });
}
