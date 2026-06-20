import { NextResponse } from 'next/server';
import { listSkills } from '@/lib/brain/db';
import { pushVaultFile } from '@/lib/vaultGit';
import type { Skill } from '@/lib/brain/skills';

function skillToMarkdown(s: Skill): string {
  return `---
name: ${s.name}
domain: ${s.domain}
escalate: ${s.escalate}
confidence: ${s.confidence}
source: ${s.source}
usage_count: ${s.usage_count}
updated: ${s.updated_at}
---

# ${s.title}

**Trigger:** ${s.trigger}

**Escalate to Charles:** ${s.escalate ? 'Yes — do not act without approval' : 'No — agent may act directly'}

**Confidence:** ${Math.round(s.confidence * 100)}%

## What to do

${s.knowledge}
`;
}

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const skills = await listSkills();
    const results = await Promise.allSettled(
      skills.map((s) =>
        pushVaultFile(
          `brain/skills/${s.name}.md`,
          skillToMarkdown(s),
          `brain: sync skill "${s.name}"`,
        ),
      ),
    );

    let pushed = 0;
    const errors: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        pushed++;
      } else {
        const msg = r.status === 'rejected'
          ? String(r.reason)
          : (r.value.error ?? 'unknown');
        errors.push(`${skills[i].name}: ${msg}`);
      }
    }

    return NextResponse.json({ ok: true, pushed, total: skills.length, errors });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
