'use client';

import { useState, useRef, useEffect } from 'react';

interface Trace { tool: string; input: unknown; resultPreview: string }
interface Msg { role: 'user' | 'assistant'; text: string; trace?: Trace[] }

const C = { cyan: '#2fd4e6', green: '#39d98a', amber: '#f5a623', red: '#ef5350', violet: '#a78bfa' };

export function CeoChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

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
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '30px 24px 40px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 18, marginBottom: 18, borderBottom: '1px solid var(--line)' }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.cyan}66`, display: 'grid', placeItems: 'center', color: C.cyan, fontSize: 15, boxShadow: '0 0 12px rgba(47,212,230,.4)' }}>◉</span>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#eef6f9' }}>CEO</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--txt-dim)' }}>fleet orchestrator · Opus 4.8 · vault-aware</div>
        </div>
        <a href="/" className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: C.cyan, textDecoration: 'none' }}>← dashboard</a>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--txt-dim)', fontSize: 13.5, lineHeight: 1.6, padding: '8px 2px' }}>
            Ask the CEO to pull context, give direction, or delegate. It reads the shared AI-memory graph and the live fleet, and can assign tasks to agents. Try:
            <ul style={{ marginTop: 10, color: 'var(--txt-mid)' }}>
              <li>“What’s the state of the fleet right now?”</li>
              <li>“Draft a week plan for the Jobs agent and delegate the first task.”</li>
              <li>“What’s my current strategy and what should I prioritize?”</li>
            </ul>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '88%', padding: '11px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? 'rgba(47,212,230,0.08)' : 'rgba(255,255,255,0.025)',
              border: `1px solid ${m.role === 'user' ? C.cyan + '33' : 'var(--line)'}`,
              color: m.role === 'user' ? '#eafcff' : 'var(--txt)',
            }}>{m.text}</div>
            {m.trace && m.trace.length > 0 && (
              <details style={{ marginTop: 6, maxWidth: '88%' }}>
                <summary className="mono" style={{ fontSize: 10.5, color: 'var(--txt-faint)', cursor: 'pointer' }}>
                  {m.trace.length} tool {m.trace.length === 1 ? 'call' : 'calls'}
                </summary>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {m.trace.map((t, j) => (
                    <div key={j} className="mono" style={{ fontSize: 10.5, color: 'var(--txt-dim)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)', borderRadius: 7, padding: '6px 9px' }}>
                      <span style={{ color: C.violet }}>{t.tool}</span>(<span style={{ color: 'var(--txt-faint)' }}>{JSON.stringify(t.input)}</span>) → {t.resultPreview}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}

        {busy && <div className="mono" style={{ fontSize: 11.5, color: C.cyan }}>CEO is thinking…</div>}
        {error && <div className="mono" style={{ fontSize: 11.5, color: C.red }}>⚠ {error}</div>}
        <div ref={endRef} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Prompt the CEO…  (Enter to send, Shift+Enter for newline)"
          rows={2}
          style={{
            flex: 1, resize: 'none', background: 'rgba(255,255,255,0.03)', color: '#eafcff',
            border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          style={{
            alignSelf: 'stretch', padding: '0 18px', borderRadius: 10, border: `1px solid ${C.cyan}55`,
            background: busy || !input.trim() ? 'rgba(255,255,255,0.04)' : 'rgba(47,212,230,0.12)',
            color: busy || !input.trim() ? 'var(--txt-faint)' : C.cyan, fontSize: 13, fontWeight: 600,
            cursor: busy || !input.trim() ? 'default' : 'pointer',
          }}
        >Send</button>
      </div>
    </div>
  );
}
