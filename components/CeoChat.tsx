'use client';

// ── Ask the CEO — orchestrator chat (black & chrome) ──────────
// Skin per ceo-page.jsx; the /api/ceo wiring and rollback-on-error
// behavior are unchanged.

import { useState, useRef, useEffect } from 'react';
import { StatusDot } from './chrome';
import { Nav, PageHeader } from './Shell';

interface Trace { tool: string; input: unknown; resultPreview: string }
interface Msg { role: 'user' | 'assistant'; text: string; trace?: Trace[] }

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
      <div className={user ? '' : 'edge'} style={{
        maxWidth: '88%', padding: '11px 14px', borderRadius: 12, fontSize: 13.5,
        lineHeight: 1.55, whiteSpace: 'pre-wrap', position: 'relative',
        background: user ? 'rgba(215,218,226,0.07)' : 'rgba(255,255,255,0.022)',
        border: `1px solid ${user ? 'rgba(215,218,226,0.22)' : 'var(--line)'}`,
        color: user ? 'var(--white)' : 'var(--txt)',
      }}>{m.text}</div>
      {m.trace && m.trace.length > 0 && <TraceBlock trace={m.trace} />}
    </div>
  );
}

export function CeoChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next: Msg[] = [...messages, { role: 'user', text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/ceo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Send only role/content the API expects; map our view-model to the wire shape.
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        setMessages((m) => m.slice(0, -1)); // roll back the user turn
        return;
      }
      setMessages((m) => [...m, { role: 'assistant', text: data.reply, trace: data.trace }]);
    } catch (e) {
      setError(String(e));
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 28px 40px', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <PageHeader
        title="Ask the CEO."
        sub={<span>Fleet orchestrator · reads the memory graph and the live fleet · can delegate. <span className="mono" style={{ fontSize: 11, color: 'var(--txt-dim)' }}>Opus 4.8 · vault-aware</span></span>}
      />
      <Nav active="Ask the CEO" />

      <section className="panel edge rise" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: 880, width: '100%', margin: '0 auto' }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 10px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 320 }}>
          {messages.length === 0 && (
            <div style={{ color: 'var(--txt-dim)', fontSize: 13.5, lineHeight: 1.6, padding: '8px 2px' }}>
              Ask the CEO to pull context, give direction, or delegate. It reads the shared AI-memory graph and the live fleet, and can assign tasks to agents. Try:
              <ul style={{ margin: '10px 0 0', paddingLeft: 20, color: 'var(--txt-mid)' }}>
                <li style={{ margin: '4px 0' }}>“What’s the state of the fleet right now?”</li>
                <li style={{ margin: '4px 0' }}>“Draft a week plan for the Jobs agent and delegate the first task.”</li>
                <li style={{ margin: '4px 0' }}>“What’s my current strategy and what should I prioritize?”</li>
              </ul>
            </div>
          )}

          {messages.map((m, i) => <Bubble key={i} m={m} />)}

          {busy && (
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--silver)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <StatusDot color="#d7dae2" pulse size={6} /> CEO is thinking…
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
    </div>
  );
}
