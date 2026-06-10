import { NextRequest, NextResponse } from 'next/server';
import { runSocialAgent, type WireMsg } from '@/lib/social/agent';
import { listAssets, listReferences } from '@/lib/social/db';
import type { EditPlan } from '@/lib/social/plan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Chat endpoint for the Social Studio editor agent. Protected by the
// fleet_session gate in middleware.ts — only the authenticated operator can
// spend tokens here. The server re-reads library + references itself so the
// agent always plans against the source of truth.

export async function POST(req: NextRequest) {
  let body: { messages?: WireMsg[]; currentPlan?: EditPlan | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }
  // Keep request bounded: history is capped client-side too, but be defensive.
  const trimmed = messages.slice(-30).map((m) => ({
    role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    text: typeof m.text === 'string' ? m.text.slice(0, 8000) : '',
    frames: Array.isArray(m.frames) ? m.frames.slice(0, 6) : undefined,
  }));

  try {
    const [assets, references] = await Promise.all([listAssets(), listReferences()]);
    const result = await runSocialAgent({
      messages: trimmed,
      assets,
      references,
      currentPlan: body.currentPlan ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status = msg.includes('ANTHROPIC_API_KEY') ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
