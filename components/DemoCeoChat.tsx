'use client';

// ── Ask the CEO — DEMO ────────────────────────────────────────
// A scripted, zero-cost stand-in for the real /ceo orchestrator. Same look
// and feel (markdown replies, expandable tool-call traces, live "thinking"
// indicator) but every answer is canned and plays back on a timer — no
// Anthropic API calls, no DB reads. Used only on the public /demo surface.

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StatusDot } from './chrome';
import { Nav, PageHeader } from './Shell';

interface Trace { tool: string; input: unknown; resultPreview: string }
interface Msg { role: 'user' | 'assistant'; text: string; trace?: Trace[]; streaming?: boolean }

interface Scene { match: string[]; trace: Trace[]; reply: string }

const SCENES: Scene[] = [
  {
    match: ['state of the fleet', 'fleet right now', 'how is the fleet', 'status of the fleet', 'state of fleet', 'how are the agents'],
    trace: [
      { tool: 'read_fleet_status', input: {}, resultPreview: '6 active · 1 degraded · 2 idle' },
      { tool: 'read_event_feed', input: { window: '24h' }, resultPreview: '31 events · +$4.5k realized' },
    ],
    reply: `Here's where the fleet stands right now:

- **Commerce** — operational. 63 orders, $4.8k revenue, +18% margin. Flagged 2 SKUs for price drift.
- **Finance** — operational. EOD recap shipped, +1.8% day P/L.
- **Lambos Trader** — ⚠ degraded. Paper P/L +6.2%, but one trade breached the position size cap.
- **Growth** — operational. 318 leads, 41 sites built, 196 emails, 3 closed.
- **Jobs** — operational. 22 applications out, 4 interviews, 1 offer.
- **Social** — operational. 7 posts scheduled, 3 trends scouted.
- **Hobbies** and **School** — idle (provisioning in Phase 4).

Net: everything green except **Lambos Trader**, which needs eyes on the risk-sizing flag before it can graduate to live capital.`,
  },
  {
    match: ['delegation', 'queue', 'open task', "what's open", 'whats open', 'still open', 'what is open'],
    trace: [
      { tool: 'read_delegations', input: { status: 'open' }, resultPreview: '2 in progress · 2 queued' },
    ],
    reply: `Open in the delegation queue:

**In progress**
- **Growth** — *Re-run outreach on no-reply leads*
- **Lambos Trader** — *Investigate size-cap breach*

**Queued**
- **Social** — *Draft 3 posts from top trend*
- **Commerce** — *Flag SKUs with >15% price drift*

The Finance EOD recap finished earlier today. Want me to reprioritize any of these?`,
  },
  {
    match: ['strategy', 'prioritize', 'priority', 'focus on', 'what should i', 'this week'],
    trace: [
      { tool: 'read_memory_graph', input: { query: 'strategy' }, resultPreview: 'goal: first revenue → reinvest' },
      { tool: 'read_fleet_status', input: {}, resultPreview: '6 active · 1 degraded' },
    ],
    reply: `Your strategy in the memory graph: **get each agent to first real revenue, then reinvest into the next one** — quiet, compounding moves rather than scaling everything at once.

Given the live state, I'd prioritize this week:

1. **Unblock Lambos Trader** — the size-cap breach gates the paper → live milestone. Fix sizing first.
2. **Push Growth's second-touch** — 40 leads have a site built but no reply; that's the closest path to cash.
3. **Bank Social's trend** — 3 scouted trends are decaying; turn the top one into posts now.

Everything else can hold. Want me to delegate these?`,
  },
  {
    match: ['delegate', 'assign', 'hand off', 'hand-off', 'follow-up pass', 'follow up pass', 'give growth'],
    trace: [
      { tool: 'delegate_task', input: { agent: 'growth', title: 'Second-touch no-reply leads' }, resultPreview: 'task #6 queued' },
    ],
    reply: `Done — I've delegated a follow-up pass to **Growth**:

> **Task #6 — Second-touch no-reply leads**
> Re-engage the 40 leads with a site built but no reply in 5+ days; A/B two new subject lines.

It's queued and Growth will pick it up on its next run. I'll surface the reply rate in the next brief.`,
  },
];

const FALLBACK = (q: string): Scene => ({
  match: [],
  trace: [{ tool: 'read_memory_graph', input: { query: q.slice(0, 40) }, resultPreview: '3 related notes' }],
  reply: `This is a **scripted demo** of the CEO orchestrator, so I'm answering from a fixed snapshot rather than the live vault. In the real system I read the shared AI-memory graph and the live fleet, and I can delegate tasks to any agent.

Try one of these to see how it works:

- *What's the state of the fleet right now?*
- *What's still open in the delegation queue?*
- *What's my current strategy and what should I prioritize?*
- *Delegate a follow-up pass to Growth.*`,
});

function pickScene(text: string): Scene {
  const t = text.toLowerCase();
  return SCENES.find((s) => s.match.some((m) => t.includes(m))) ?? FALLBACK(text);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function TraceBlock({ trace }: { trace: Trace[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 6, maxWidth: '88%' }}>
      <button onClick={() => setOpen(!open)} className="mono" style={{
        fontSize: 10.5, color: 'var(--txt-faint)', cursor: 'pointer', whiteSpace: 'nowrap',
        background: 'none', border: 'none', padding: 0, letterSpacing: '0.04em',
      }}>
        {open ? '▾' : '▸'} {trace.length} tool {trace.length === 1 ? 'call' : 'calls'}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {trace.map((t, j) => (
            <div key={j} className="mono" style={{
              fontSize: 10.5, color: 'var(--txt-dim)', background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--line)', borderRadius: 7, padding: '6px 9px', overflowWrap: 'anywhere',
            }}>
              <span style={{ color: 'var(--silver)' }}>{t.tool}</span>
              <span style={{ color: 'var(--txt-faint)' }}>({JSON.stringify(t.input)})</span>
              {' → '}{t.resultPreview}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const user = m.role === 'user';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: user ? 'flex-end' : 'flex-start' }}>
      <div className={user ? '' : 'edge chat-md'} style={{
        maxWidth: '88%', padding: '11px 14px', borderRadius: 12, fontSize: 13.5,
        lineHeight: 1.55, position: 'relative', whiteSpace: user ? 'pre-wrap' : undefined,
        background: user ? 'rgba(215,218,226,0.07)' : 'rgba(255,255,255,0.022)',
        border: `1px solid ${user ? 'rgba(215,218,226,0.22)' : 'var(--line)'}`,
        color: user ? 'var(--white)' : 'var(--txt)',
      }}>
        {user ? m.text : <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>}
      </div>
      {!m.streaming && m.trace && m.trace.length > 0 && <TraceBlock trace={m.trace} />}
    </div>
  );
}

export function DemoCeoChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [liveTool, setLiveTool] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const patchDraft = (fn: (m: Msg) => Msg) =>
    setMessages((ms) => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)));

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    const scene = pickScene(text);
    setMessages((ms) => [...ms, { role: 'user', text }, { role: 'assistant', text: '', trace: [], streaming: true }]);
    setInput('');
    setBusy(true);

    await sleep(420); // "thinking"

    // play tool calls
    for (const t of scene.trace) {
      setLiveTool(t.tool);
      patchDraft((m) => ({ ...m, trace: [...(m.trace ?? []), { ...t, resultPreview: '…' }] }));
      await sleep(620);
      patchDraft((m) => {
        const trace = [...(m.trace ?? [])];
        for (let i = trace.length - 1; i >= 0; i--) {
          if (trace[i].tool === t.tool && trace[i].resultPreview === '…') { trace[i] = { ...t }; break; }
        }
        return { ...m, trace };
      });
      setLiveTool(null);
      await sleep(160);
    }

    // stream the reply, word by word
    const words = scene.reply.split(/(\s+)/);
    let acc = '';
    for (const w of words) {
      acc += w;
      patchDraft((m) => ({ ...m, text: acc }));
      if (w.trim()) await sleep(16);
    }
    patchDraft((m) => ({ ...m, streaming: undefined }));
    setBusy(false);
    setLiveTool(null);
  }

  const SUGGESTIONS = [
    'What’s the state of the fleet right now?',
    'What’s still open in the delegation queue?',
    'What’s my current strategy and what should I prioritize?',
    'Delegate a follow-up pass to Growth.',
  ];

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }} className="page">
      <PageHeader
        title="Ask the CEO."
        sub={<span>Fleet orchestrator · reads the memory graph and the live fleet · can delegate. <span className="mono" style={{ fontSize: 11, color: 'var(--txt-dim)' }}>Opus 4.8 · scripted demo</span></span>}
      />
      <Nav active="Ask the CEO" demo />

      <section className="panel edge rise" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: 880, width: '100%', margin: '0 auto', position: 'relative' }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 10px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 320 }}>
          {messages.length === 0 && (
            <div style={{ color: 'var(--txt-dim)', fontSize: 13.5, lineHeight: 1.6, padding: '8px 2px' }}>
              This is a scripted preview of the orchestrator that runs the fleet. In the live app it reads the shared AI-memory graph and the real-time fleet, and can delegate tasks to agents. Tap a question to see it work:
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="mono" style={{
                    fontSize: 11, color: 'var(--silver)', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--line)', borderRadius: 8, padding: '7px 11px',
                    cursor: 'pointer', textAlign: 'left', letterSpacing: '0.02em',
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (m.streaming && !m.text && !(m.trace && m.trace.length) ? null : <Bubble key={i} m={m} />))}

          {busy && (
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--silver)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <StatusDot color="#d7dae2" pulse size={6} />
              {liveTool ? <span>{liveTool}…</span> : 'CEO is thinking…'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '14px 16px 16px', borderTop: '1px solid var(--line)' }}>
          <textarea
            className="field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Prompt the CEO…  (Enter to send, Shift+Enter for newline)"
            rows={2}
            style={{ flex: 1 }}
          />
          <button className="btn-chrome" onClick={() => send()} disabled={busy || !input.trim()} style={{ alignSelf: 'stretch' }}>
            Send
          </button>
        </div>
      </section>

      <p className="mono" style={{ fontSize: 10.5, color: 'var(--txt-faint)', margin: '16px 0 0', textAlign: 'center' }}>
        Scripted demo · responses are illustrative. The live orchestrator runs on Opus with real vault + fleet tools.
      </p>

      <style>{`
        .chat-md p { margin: 8px 0; }
        .chat-md p:first-child { margin-top: 0; }
        .chat-md p:last-child { margin-bottom: 0; }
        .chat-md ul, .chat-md ol { margin: 8px 0; padding-left: 20px; }
        .chat-md li { margin: 3px 0; }
        .chat-md h1, .chat-md h2, .chat-md h3 { color: var(--white); font-size: 14px; margin: 12px 0 6px; font-weight: 600; }
        .chat-md code { font-family: var(--mono); font-size: 12px; background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; }
        .chat-md pre { background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 8px; padding: 10px; overflow-x: auto; margin: 8px 0; }
        .chat-md pre code { background: none; padding: 0; }
        .chat-md strong { color: var(--white); }
        .chat-md blockquote { margin: 8px 0; padding: 6px 11px; border-left: 2px solid rgba(215,218,226,0.35); background: rgba(215,218,226,0.04); border-radius: 0 6px 6px 0; color: var(--txt-mid); }
        .chat-md table { border-collapse: collapse; margin: 8px 0; font-size: 12.5px; display: block; overflow-x: auto; }
        .chat-md th, .chat-md td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; }
        .chat-md th { background: rgba(255,255,255,0.03); color: var(--white); }
        .chat-md a { color: var(--silver); border-bottom: 1px dotted rgba(215,218,226,0.45); }
        .chat-md hr { border: none; border-top: 1px solid var(--line); margin: 12px 0; }
      `}</style>
    </div>
  );
}
