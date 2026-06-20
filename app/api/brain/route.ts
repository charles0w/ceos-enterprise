import { NextRequest, NextResponse } from 'next/server';
import { listSkills, getSkill, upsertSkill, deleteSkill, seedSkillsIfEmpty } from '@/lib/brain/db';
import { rankSkills, SEED_SKILLS } from '@/lib/brain/skills';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await seedSkillsIfEmpty(SEED_SKILLS);

    const name = req.nextUrl.searchParams.get('name');
    const domain = req.nextUrl.searchParams.get('domain') ?? undefined;
    const q = req.nextUrl.searchParams.get('q') ?? '';

    if (name) {
      const skill = await getSkill(name);
      return skill
        ? NextResponse.json({ skill })
        : NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const skills = await listSkills(domain);
    const results = q ? rankSkills(skills, q) : skills;
    return NextResponse.json({ skills: results, total: skills.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.title || !body.trigger || !body.knowledge || !body.domain) {
      return NextResponse.json({ error: 'name, title, trigger, knowledge, and domain are required' }, { status: 400 });
    }
    const skill = await upsertSkill({
      name: String(body.name).toLowerCase().replace(/\s+/g, '-').slice(0, 80),
      title: String(body.title).slice(0, 120),
      trigger: String(body.trigger).slice(0, 400),
      knowledge: String(body.knowledge).slice(0, 8000),
      domain: body.domain,
      escalate: Boolean(body.escalate),
      confidence: Math.min(1, Math.max(0, Number(body.confidence ?? 0.8))),
      source: String(body.source || 'manual').slice(0, 80),
    });
    return NextResponse.json({ ok: true, skill });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  try {
    await deleteSkill(name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
