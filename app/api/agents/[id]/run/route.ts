import { NextRequest, NextResponse } from 'next/server';
import { AGENTS } from '@/lib/agents';
import { enqueueTask } from '@/lib/fleetTasks';
import { logEvent } from '@/lib/events';

// On-demand run trigger (pull model). POST /api/agents/{id}/run enqueues a
// run-request onto the delegation queue (fleet_tasks); the agent services it the
// next time it wakes/polls via reporter/fleet_tasks.py. Nothing runs 24/7 — a
// request simply waits until the agent picks it up, which is exactly the
// "ready whenever I need it" model.
//
// This is also the webhook/hook target: any external event (a cron, a GitHub
// webhook, the auto-remediation runbook) can POST here with the report secret to
// request a run.
//
// Auth mirrors /api/tasks: x-report-secret (machine/hook) OR fleet_session cookie
// (the dashboard's "Run" button).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-report-secret');
  if (secret && process.env.REPORT_SECRET && secret === process.env.REPORT_SECRET) return true;
  const session = req.cookies.get('fleet_session')?.value;
  const expected = process.env.FLEET_PASSWORD ?? '';
  return !!expected && session === expected;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const agent = AGENTS.find((a) => a.id === id);
  if (!agent) {
    return NextResponse.json({ error: `unknown agent "${id}"` }, { status: 404 });
  }

  // Optional context from the caller (reason/source), stored on the queued task.
  const body: { reason?: string; source?: string } = await req.json().catch(() => ({}));
  const via = req.headers.get('x-report-secret') ? 'machine' : 'dashboard';
  const source = (body.source ?? via).toString().slice(0, 32);
  const reason = (body.reason ?? 'on-demand run requested').toString().slice(0, 500);

  try {
    const task = await enqueueTask(id, {
      title: 'Run requested',
      spec: reason,
      createdBy: source,
    });
    await logEvent(id, 'info', `run requested (${source}) → task #${task.id}`);
    return NextResponse.json({ queued: true, agent: id, taskId: task.id, status: task.status });
  } catch (e) {
    return NextResponse.json({ error: 'enqueue-failed', detail: String(e) }, { status: 500 });
  }
}
