'use client';

// ── Ask the CEO — orchestrator chat (black & chrome) ──────────
// Streams the agentic loop live over SSE (text deltas + tool events),
// renders assistant replies as markdown, and restores the last session
// from localStorage. The /api/ceo contract: data: {type: text|tool_start|
// tool_result|done|error} events.

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StatusDot } from './chrome';
import { Nav, PageHeader } from './Shell';

interface Trace { tool: string; input: unknown; resultPreview: string }
interface Msg { role: 'user' | 'assistant'; text: string; trace?: Trace[]; streaming?: boolean }

const LS_KEY = 'ceo-chat:session';

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
              border: '1px solid var(--line)', borderRadius: 7, padding: '6px 9px',
              overflowWrap: 'anywhere',
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
        lineHeight: 1.55, position: 'relative',
        whiteSpace: user ? 'pre-wrap' : undefined,
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

export function CeoChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [liveTool, setLiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // restore the last session after mount (localStorage isn't there during SSR)
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || 'null') as Msg[] | null;
      if (Array.isArray(cached) && cached.length) setMessages(cached);
    } catch { /* nothing cached */ }
  }, []);

  const persist = useCallback((msgs: Msg[]) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(
        msgs.filter((m) => !m.streaming).slice(-40)
      ));
    } catch { /* full */ }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const base: Msg[] = [...messages, { role: 'user', text }];
    // draft assistant bubble that the stream fills in
    setMessages([...base, { role: 'assistant', text: '', trace: [], streaming: true }]);
    setInput('');
    setBusy(true);
    setLiveTool(null);

    const patchDraft = (fn: (m: Msg) => Msg) =>
      setMessages((ms) => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)));

    let streamedAny = false;
    try {
      const res = await fetch('/api/ceo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: base.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!line.startsWith('data: ')) continue;
          let e: { type: string; text?: string; tool?: string; input?: unknown; preview?: string; reply?: string; trace?: Trace[]; error?: string };
          try { e = JSON.parse(line.slice(6)); } catch { continue; }
          if (e.type === 'text' && e.text) {
            streamedAny = true;
            patchDraft((m) => ({ ...m, text: m.text + e.text }));
          } else if (e.type === 'tool_start' && e.tool) {
            setLiveTool(e.tool);
            patchDraft((m) => ({ ...m, trace: [...(m.trace ?? []), { tool: e.tool!, input: e.input, resultPreview: '…' }] }));
          } else if (e.type === 'tool_result' && e.tool) {
            setLiveTool(null);
            patchDraft((m) => {
              const trace = [...(m.trace ?? [])];
              for (let i = trace.length - 1; i >= 0; i--) {
                if (trace[i].tool === e.tool && trace[i].resultPreview === '…') {
                  trace[i] = { ...trace[i], resultPreview: e.preview ?? '' };
                  break;
                }
              }
              return { ...m, trace };
            });
          } else if (e.type === 'done') {
            finished = true;
            setMessages((ms) => {
              const next = ms.map((m, i) => (i === ms.length - 1
                ? { role: 'assistant' as const, text: e.reply || m.text, trace: e.trace ?? m.trace }
                : m));
              persist(next);
              return next;
            });
          } else if (e.type === 'error') {
            throw new Error(e.error || 'stream error');
          }
        }
      }
      if (!finished) throw new Error('stream ended unexpectedly — try again');
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      if (streamedAny) {
        // keep what streamed in; just unmark it
        setMessages((ms) => {
          const next = ms.map((m, i) => (i === ms.length - 1 ? { ...m, streaming: undefined } : m));
          persist(next);
          return next;
        });
      } else {
        setMessages(messages); // roll back the user turn + empty draft
      }
    } finally {
      setBusy(false);
      setLiveTool(null);
    }
  }

  function newSession() {
    setMessages([]);
    setError(null);
    try { localStorage.removeItem(LS_KEY); } catch { /* fine */ }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }} className="page">
      <PageHeader
        title="Ask the CEO."
        sub={<span>Fleet orchestrator · reads the memory graph and the live fleet · can delegate. <span className="mono" style={{ fontSize: 11, color: 'var(--txt-dim)' }}>Opus 4.8 · vault-aware</span></span>}
      />
      <Nav active="Ask the CEO" />

      <section className="panel edge rise" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: 880, width: '100%', margin: '0 auto', position: 'relative' }}>
        {messages.length > 0 && !busy && (
          <button onClick={newSession} className="mono" title="clear this conversation (it's already logged to the vault)" style={{
            position: 'absolute', top: 10, right: 12, zIndex: 2,
            fontSize: 9.5, color: 'var(--txt-dim)', background: 'rgba(10,10,12,0.8)',
            border: '1px solid var(--line)', borderRadius: 6, padding: '3px 8px',
            cursor: 'pointer', letterSpacing: '0.06em',
          }}>✕ new session</button>
        )}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 10px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 320 }}>
          {messages.length === 0 && (
            <div style={{ color: 'var(--txt-dim)', fontSize: 13.5, lineHeight: 1.6, padding: '8px 2px' }}>
              Ask the CEO to pull context, give direction, or delegate. It reads the shared AI-memory graph and the live fleet, and can assign tasks to agents. Try:
              <ul style={{ margin: '10px 0 0', paddingLeft: 20, color: 'var(--txt-mid)' }}>
                <li style={{ margin: '4px 0' }}>“What’s the state of the fleet right now?”</li>
                <li style={{ margin: '4px 0' }}>“What’s still open in the delegation queue?”</li>
                <li style={{ margin: '4px 0' }}>“What’s my current strategy and what should I prioritize?”</li>
              </ul>
            </div>
          )}

          {messages.map((m, i) => (m.streaming && !m.text ? null : <Bubble key={i} m={m} />))}

          {busy && (
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--silver)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <StatusDot color="#d7dae2" pulse size={6} />
              {liveTool ? <span>{liveTool}…</span> : 'CEO is thinking…'}
            </div>
          )}
          {error && <div className="mono" style={{ fontSize: 11.5, color: 'var(--err)' }}>⚠ {error}</div>}
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
          <button className="btn-chrome" onClick={send} disabled={busy || !input.trim()} style={{ alignSelf: 'stretch' }}>
            Send
          </button>
        </div>
      </section>

      <p className="mono" style={{ fontSize: 10.5, color: 'var(--txt-faint)', margin: '16px 0 0', textAlign: 'center' }}>
        try — “What should I prioritize this week?” · “Delegate a follow-up pass to Growth.”
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
