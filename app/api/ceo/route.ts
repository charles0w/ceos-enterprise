import { NextRequest, NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { runCeoStream, type CeoStreamEvent } from '@/lib/ceo';
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
export const maxDuration = 300; // agentic loop + Opus 4.8; streamed so the UI is never silent

// Chat endpoint for the CEO orchestrator. Protected by the fleet_session gate
// in middleware.ts (not in PUBLIC_PREFIXES), so only an authenticated operator
// can spend tokens here. Responds with SSE: text deltas + tool events while
// the loop runs, then a final `done` event carrying the reply + trace.
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: CeoStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch { /* client went away mid-stream */ }
      };
      try {
        const result = await runCeoStream(messages, send);
        // Log the prompt into the memory graph (best-effort; never blocks the reply).
        await logCeoSession(lastUserText(messages), result.reply).catch(() => {});
        send({ type: 'done', reply: result.reply, trace: result.trace });
      } catch (err) {
        send({ type: 'error', error: String(err instanceof Error ? err.message : err) });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
