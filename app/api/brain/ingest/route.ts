import { NextRequest, NextResponse } from 'next/server';
import { upsertSkill } from '@/lib/brain/db';
import type { SkillInsert, SkillDomain } from '@/lib/brain/skills';
import { SKILL_DOMAINS } from '@/lib/brain/skills';

export const dynamic = 'force-dynamic';

function authed(req: NextRequest): boolean {
  const secret = req.headers.get('x-report-secret');
  return !!secret && secret === process.env.REPORT_SECRET;
}

function coerceDomain(v: unknown): SkillDomain {
  return SKILL_DOMAINS.includes(v as SkillDomain) ? (v as SkillDomain) : 'internal';
}

function toInsert(raw: Record<string, unknown>): SkillInsert | null {
  const name = String(raw.name ?? '').trim();
  const title = String(raw.title ?? '').trim();
  if (!name || !title) return null;
  const conf = Number(raw.confidence);
  const out = (raw.outcomes ?? {}) as { good?: unknown; bad?: unknown };
  return {
    name,
    title,
    trigger: String(raw.trigger ?? ''),
    knowledge: String(raw.knowledge ?? ''),
    domain: coerceDomain(raw.domain),
    escalate: raw.escalate === true,
    confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.8,
    source: String(raw.source ?? 'vault'),
    status: (['active', 'proposed', 'retired'].includes(String(raw.status)) ? String(raw.status) : 'active') as SkillInsert['status'],
    last_fired: raw.last_fired == null ? null : String(raw.last_fired),
    outcomes: { good: Number(out.good ?? 0) || 0, bad: Number(out.bad ?? 0) || 0 },
    evidence: Array.isArray(raw.evidence) ? raw.evidence.map(String) : [],
  };
}

export async function POST(req: NextRequest) {
  if (!authed(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as { skills?: unknown };
    const list = Array.isArray(body.skills) ? body.skills : [];
    let upserted = 0;
    let skipped = 0;
    for (const raw of list) {
      const insert = raw && typeof raw === 'object' ? toInsert(raw as Record<string, unknown>) : null;
      if (!insert) { skipped++; continue; }
      await upsertSkill(insert);
      upserted++;
    }
    return NextResponse.json({ ok: true, upserted, skipped });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
