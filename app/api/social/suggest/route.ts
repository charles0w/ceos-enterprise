import { NextRequest, NextResponse } from 'next/server';
import { runSuggestions } from '@/lib/social/suggest';
import { listAssets, listReferences, getProject } from '@/lib/social/db';
import type { EditPlan } from '@/lib/social/plan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // a few web searches + synthesis

// Trend research endpoint. Pulls library/references/plan as context so the
// research is grounded in what the user is actually cutting. Behind the
// fleet_session gate (token + web-search spend protected).

export async function POST(req: NextRequest) {
  let body: { topic?: string; account?: string };
  try { body = await req.json(); } catch { body = {}; }

  try {
    const [assets, references, project] = await Promise.all([
      listAssets().catch(() => []),
      listReferences().catch(() => []),
      getProject('studio-main').catch(() => null),
    ]);
    const account = body.account === 'ceo0uch' ? 'ceo0uch' as const : 'client' as const;
    const result = await runSuggestions({
      topic: typeof body.topic === 'string' && body.topic.trim()
        ? body.topic.slice(0, 200)
        : account === 'ceo0uch' ? 'soft tech / ivy gorp menswear (Aimé Leon Dore axis)' : undefined,
      account,
      plan: (project?.plan ?? null) as EditPlan | null,
      assets,
      references,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status = msg.includes('ANTHROPIC_API_KEY') ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
