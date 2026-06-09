import { NextRequest, NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { runCeo } from '@/lib/ceo';
import { logCeoSession } from '@/lib/aiMemory';

function lastUserText(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue;
    const c = messages[i].content;
    return typeof c === 'string'
      ? c
      : c.map((b) => ('text' in b ? b.text : '')).join(' ').trim();
  }
  return '';
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // agentic loop + Opus 4.8 can take a while

// Chat endpoint for the CEO orchestrator. Protected by the fleet_session gate
// in middleware.ts (not in PUBLIC_PREFIXES), so only an authenticated operator
// can spend tokens here.
export async function POST(req: NextRequest) {
  let body: { messages?: Anthropic.MessageParam[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

  try {
    const result = await runCeo(messages);
    // Log the prompt into the memory graph (best-effort; never blocks the reply).
    await logCeoSession(lastUserText(messages), result.reply);
    return NextResponse.json(result);
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status = msg.includes('ANTHROPIC_API_KEY') ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
