import { NextRequest, NextResponse } from 'next/server';
import { getRecentTasks, updateTaskStatus, TASK_STATUSES, type TaskStatus } from '@/lib/fleetTasks';
import { logEvent } from '@/lib/events';
import { authorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// The delegation queue, readable by two audiences (middleware lets this
// route through; auth happens here, via the shared dual-auth in lib/auth.ts):
//   - the dashboard (fleet_session cookie) — renders the Delegations panel
//   - fleet agents (x-report-secret header) — poll their queue and report
//     progress: GET /api/tasks?agentId=growth&status=queued, then
//     PATCH { id, status: "in_progress" | "done" | "dropped" }

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const p = req.nextUrl.searchParams;
  const agentId = p.get('agentId') ?? undefined;
  const statusParam = p.get('status') ?? undefined;
  if (statusParam && !TASK_STATUSES.includes(statusParam as TaskStatus)) {
    return NextResponse.json({ error: `status must be one of ${TASK_STATUSES.join(', ')}` }, { status: 400 });
  }
  const tasks = await getRecentTasks({
    agentId,
    status: statusParam as TaskStatus | undefined,
    limit: Number(p.get('limit') ?? 20) || 20,
  });
  return NextResponse.json({ tasks });
}

export async function PATCH(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body: { id?: number; status?: string } = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'missing or invalid id' }, { status: 400 });
  }
  if (!body.status || !TASK_STATUSES.includes(body.status as TaskStatus)) {
    return NextResponse.json({ error: `status must be one of ${TASK_STATUSES.join(', ')}` }, { status: 400 });
  }
  const found = await updateTaskStatus(id, body.status as TaskStatus);
  if (!found) return NextResponse.json({ error: `no task #${id}` }, { status: 404 });
  await logEvent('fleet', 'info', `task #${id} → ${body.status}`);
  return NextResponse.json({ ok: true });
}
