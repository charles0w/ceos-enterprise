import { NextRequest, NextResponse } from 'next/server';
import { getProject, listProjects, upsertProject, deleteProject } from '@/lib/social/db';
import { validatePlan, type AssetMeta } from '@/lib/social/plan';
import { listAssets } from '@/lib/social/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  try {
    if (id) {
      const project = await getProject(id);
      return project
        ? NextResponse.json({ project })
        : NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ projects: await listProjects() });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const id = typeof body.id === 'string' && body.id ? body.id : `proj_${Date.now().toString(36)}`;

  // If a plan is included, validate it server-side too (the agent already
  // validated, but the client can also hand-edit plans).
  let plan = undefined as undefined | null | import('@/lib/social/plan').EditPlan;
  if (body.plan === null) plan = null;
  else if (body.plan !== undefined) {
    const assets = (await listAssets()).map<AssetMeta>((a) => ({
      id: a.id, kind: a.kind, duration: a.duration,
    }));
    const v = validatePlan(body.plan, assets);
    if (!v.ok) return NextResponse.json({ error: `invalid plan: ${v.errors.join('; ')}` }, { status: 400 });
    plan = v.plan;
  }

  try {
    await upsertProject({
      id,
      title: typeof body.title === 'string' ? body.title.slice(0, 120) : undefined,
      plan: plan as never,
      messages: Array.isArray(body.messages) ? body.messages : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      output: body.output && typeof body.output === 'object' ? (body.output as Record<string, unknown>) : undefined,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    await deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
