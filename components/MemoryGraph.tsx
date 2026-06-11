'use client';

// ── Memory graph — canvas force sim + note sidebar (black & chrome) ──
// Skin per graph-page.jsx. The force sim, hit-testing, pan/zoom/drag,
// selection highlighting and wikilink resolution are unchanged.

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Nav, PageHeader } from './Shell';

interface GNode { id: string; title: string; kind: string; degree: number }
interface GLink { source: string; target: string }
interface SimNode extends GNode { x: number; y: number; vx: number; vy: number; r: number }
interface NoteData { slug: string; title: string; kind: string; body: string; links: string[] }

// color = kind: core white (what matters most), fleet green,
// entities violet (things in the world), sessions/learnings gold
const KIND_COLOR: Record<string, string> = {
  core: '#f4f5f8', fleet: '#3fe08f', entity: '#a78bfa', session: '#f2c14e', learning: '#f2c14e',
};
const colorFor = (k: string) => KIND_COLOR[k] ?? '#84868f';

// [[Target|Alias]] -> [Alias](#node:Target) ; > [!type] Title -> > **Title**
function prepMarkdown(body: string): string {
  return body
    .replace(/^>\s*\[!(\w+)\]\s*(.*)$/gm, (_m, type, rest) => `> **${(rest || type).trim()}**`)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, tgt, alias) => {
      const label = (alias || tgt).trim();
      return `[${label}](#node:${encodeURIComponent(tgt.trim())})`;
    });
}

export function MemoryGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [meta, setMeta] = useState<{ nodes: number; links: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ title: string; kind: string; x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState<NoteData | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [connections, setConnections] = useState<{ id: string; title: string; kind: string }[]>([]);

  // shared graph state for the sidebar + the canvas highlight
  const graphRef = useRef<{
    adj: Map<string, Set<string>>;
    info: Map<string, { title: string; kind: string }>;
    keyToId: Map<string, string>;
  }>({ adj: new Map(), info: new Map(), keyToId: new Map() });
  const selectedIdRef = useRef<string | null>(null);

  // Resolve a wikilink target (title / slug / path) to a node id, then select it.
  const selectByTarget = useCallback((target: string) => {
    const t = decodeURIComponent(target).trim();
    const k2 = graphRef.current.keyToId;
    const cands = [t.toLowerCase(), t.split('/').pop()!.toLowerCase(), t.replace(/\.md$/, '').toLowerCase()];
    for (const c of cands) {
      const id = k2.get(c);
      if (id) { setSelectedId(id); return true; }
    }
    return false;
  }, []);

  // Load the note + connections whenever the selection changes.
  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!selectedId) { setNote(null); setConnections([]); return; }
    const adj = graphRef.current.adj.get(selectedId) ?? new Set<string>();
    setConnections([...adj].map((id) => ({ id, ...(graphRef.current.info.get(id) ?? { title: id, kind: '' }) }))
      .sort((a, b) => a.title.localeCompare(b.title)));
    let cancelled = false;
    setNoteLoading(true);
    fetch(`/api/note?slug=${encodeURIComponent(selectedId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`note ${r.status}`))))
      .then((d) => { if (!cancelled) setNote(d); })
      .catch(() => { if (!cancelled) setNote(null); })
      .finally(() => { if (!cancelled) setNoteLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  useEffect(() => {
    let raf = 0;
    let nodes: SimNode[] = [];
    let links: { s: SimNode; t: SimNode }[] = [];
    const view = { x: 0, y: 0, scale: 1 };
    let dragNode: SimNode | null = null;
    let downNode: SimNode | null = null;
    let panning = false, moved = false;
    let lastX = 0, lastY = 0, downX = 0, downY = 0;
    let alpha = 1, cancelled = false;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const screenToWorld = (sx: number, sy: number) => ({ x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale });
    function nodeAt(sx: number, sy: number): SimNode | null {
      const p = screenToWorld(sx, sy);
      for (const n of nodes) { const dx = n.x - p.x, dy = n.y - p.y; if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n; }
      return null;
    }

    function step() {
      const cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.01;
          const f = (3200 * alpha) / d2, d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      for (const l of links) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - 90) * 0.015 * alpha, fx = (dx / d) * f, fy = (dy / d) * f;
        l.s.vx += fx; l.s.vy += fy; l.t.vx -= fx; l.t.vy -= fy;
      }
      for (const n of nodes) {
        if (n === dragNode) { n.vx = 0; n.vy = 0; continue; }
        n.vx += (cx - n.x) * 0.0016 * alpha; n.vy += (cy - n.y) * 0.0016 * alpha;
        n.vx *= 0.86; n.vy *= 0.86; n.x += n.vx; n.y += n.vy;
      }
      if (alpha > 0.04) alpha *= 0.992;
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.save();
      ctx.translate(view.x, view.y); ctx.scale(view.scale, view.scale);
      const sel = selectedIdRef.current;
      const adj = sel ? (graphRef.current.adj.get(sel) ?? new Set<string>()) : null;
      const isHot = (id: string) => !sel || id === sel || (adj?.has(id) ?? false);

      ctx.lineWidth = 0.7 / view.scale;
      for (const l of links) {
        const hot = !sel || (isHot(l.s.id) && isHot(l.t.id) && (l.s.id === sel || l.t.id === sel));
        ctx.strokeStyle = hot ? 'rgba(215,218,226,0.32)' : sel ? 'rgba(180,184,196,0.045)' : 'rgba(180,184,196,0.14)';
        ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); ctx.stroke();
      }
      for (const n of nodes) {
        const hot = isHot(n.id);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.id === sel ? n.r + 1.5 : n.r, 0, Math.PI * 2);
        ctx.fillStyle = colorFor(n.kind); ctx.globalAlpha = hot ? 0.95 : 0.13; ctx.fill();
        if (n.id === sel) { ctx.lineWidth = 2 / view.scale; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      // labels for selected + neighbors only
      if (sel) {
        ctx.font = `${11 / view.scale}px ui-monospace, monospace`;
        ctx.fillStyle = '#d7dae2'; ctx.textAlign = 'center';
        for (const n of nodes) if (isHot(n.id)) ctx.fillText(n.title, n.x, n.y - n.r - 5 / view.scale);
      }
      ctx.restore();
    }

    function frame() { if (cancelled) return; step(); draw(); raf = requestAnimationFrame(frame); }

    const onDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      downX = sx; downY = sy; moved = false;
      const n = nodeAt(sx, sy);
      downNode = n;
      if (n) { dragNode = n; alpha = Math.max(alpha, 0.35); } else { panning = true; }
      lastX = sx; lastY = sy;
    };
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (Math.abs(sx - downX) + Math.abs(sy - downY) > 4) moved = true;
      if (dragNode) { const p = screenToWorld(sx, sy); dragNode.x = p.x; dragNode.y = p.y; }
      else if (panning) { view.x += sx - lastX; view.y += sy - lastY; }
      else { const n = nodeAt(sx, sy); setHover(n ? { title: n.title, kind: n.kind, x: sx, y: sy } : null); canvas.style.cursor = n ? 'pointer' : 'grab'; }
      lastX = sx; lastY = sy;
    };
    const onUp = () => {
      if (!moved && downNode) setSelectedId(downNode.id);     // click on a node -> open
      else if (!moved && !downNode) setSelectedId(null);       // click on empty bg -> close
      dragNode = null; downNode = null; panning = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const ns = Math.min(4, Math.max(0.25, view.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      view.x = sx - (sx - view.x) * (ns / view.scale); view.y = sy - (sy - view.y) * (ns / view.scale); view.scale = ns;
    };

    (async () => {
      try {
        const res = await fetch('/api/graph');
        if (!res.ok) { setError(`failed to load graph (${res.status})`); return; }
        const data: { nodes: GNode[]; links: GLink[] } = await res.json();
        if (cancelled) return;
        resize();
        const w = canvas.clientWidth, h = canvas.clientHeight;
        const byId = new Map<string, SimNode>();
        const adj = new Map<string, Set<string>>(), info = new Map<string, { title: string; kind: string }>(), keyToId = new Map<string, string>();
        nodes = data.nodes.map((n, i) => {
          const ang = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
          const sn: SimNode = { ...n, r: 3 + Math.sqrt(n.degree) * 1.7, x: w / 2 + Math.cos(ang) * (120 + (i % 7) * 18), y: h / 2 + Math.sin(ang) * (120 + (i % 7) * 18), vx: 0, vy: 0 };
          byId.set(n.id, sn); info.set(n.id, { title: n.title, kind: n.kind });
          keyToId.set(n.id.toLowerCase(), n.id); keyToId.set(n.title.toLowerCase(), n.id); keyToId.set(n.id.split('/').pop()!.toLowerCase(), n.id);
          return sn;
        });
        links = data.links.map((l) => ({ s: byId.get(l.source)!, t: byId.get(l.target)! })).filter((l) => l.s && l.t);
        for (const l of data.links) {
          if (!adj.has(l.source)) adj.set(l.source, new Set());
          if (!adj.has(l.target)) adj.set(l.target, new Set());
          adj.get(l.source)!.add(l.target); adj.get(l.target)!.add(l.source);
        }
        graphRef.current = { adj, info, keyToId };
        setMeta({ nodes: nodes.length, links: links.length });
        canvas.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('resize', resize);
        frame();
      } catch (e) { setError(String(e)); }
    })();

    return () => {
      cancelled = true; cancelAnimationFrame(raf);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const open = !!selectedId;

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 28px 40px', display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <PageHeader
        title="Memory graph."
        sub="Everything the fleet knows, linked. Click a node to read it — drag to rearrange, scroll to zoom."
      />
      <Nav active="Memory graph" />

      <section className="panel edge rise" style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 480 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, display: 'block' }} />

        {/* meta + legend */}
        <div className="mono" style={{ position: 'absolute', top: 14, left: 16, fontSize: 10.5, color: 'var(--txt-faint)', whiteSpace: 'nowrap' }}>
          {meta ? `${meta.nodes} notes · ${meta.links} links` : 'loading the vault…'}
        </div>
        <div style={{ position: 'absolute', bottom: 14, left: 16, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {Object.entries({ core: 'core', fleet: 'fleet', entity: 'entities', session: 'sessions' }).map(([k, label]) => (
            <span key={k} className="mono" style={{ fontSize: 10.5, color: 'var(--txt-dim)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: colorFor(k), display: 'inline-block', boxShadow: `0 0 6px ${colorFor(k)}66` }} />{label}
            </span>
          ))}
        </div>

        {error && <div className="mono" style={{ position: 'absolute', top: 38, left: 16, color: 'var(--err)', fontSize: 12 }}>⚠ {error}</div>}

        {/* hover tooltip */}
        {hover && !open && (
          <div className="mono" style={{
            position: 'absolute', left: hover.x + 12, top: hover.y + 12, pointerEvents: 'none',
            background: 'rgba(8,8,10,0.94)', border: '1px solid var(--line-2)', borderRadius: 6,
            padding: '4px 8px', fontSize: 11, color: 'var(--white)', whiteSpace: 'nowrap',
          }}>
            <span style={{ color: colorFor(hover.kind) }}>●</span> {hover.title}
          </div>
        )}

        {/* note sidebar — slides in from the right, inside the panel */}
        <aside style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(400px, 92%)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .22s cubic-bezier(.2,.7,.3,1)',
          background: 'rgba(8,8,10,0.97)', borderLeft: '1px solid var(--line)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-20px 0 50px -30px rgba(0,0,0,0.9)',
        }}>
          {note && (
            <>
              <header style={{ padding: '16px 18px 13px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: colorFor(note.kind), flexShrink: 0, boxShadow: `0 0 7px ${colorFor(note.kind)}88` }} />
                  <span className="mono" style={{ fontSize: 10, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{note.kind}</span>
                  <button onClick={() => setSelectedId(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--txt-mid)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <h2 className="chrome" style={{ margin: '8px 0 2px', fontSize: 19, fontWeight: 700 }}>{note.title}</h2>
                <div className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>{note.slug}</div>
              </header>

              <div className="note-md" style={{ overflowY: 'auto', padding: '14px 18px 22px', flex: 1 }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => {
                      if (href?.startsWith('#node:')) {
                        const tgt = href.slice(6);
                        return <a href={`#node:${tgt}`} onClick={(e) => { e.preventDefault(); selectByTarget(tgt); }} style={{ color: 'var(--silver)', borderBottom: '1px dotted rgba(215,218,226,0.45)' }}>{children}</a>;
                      }
                      return <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>{children}</a>;
                    },
                  }}
                >{prepMarkdown(note.body)}</ReactMarkdown>

                {connections.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                    <div className="label" style={{ marginBottom: 9 }}>Connections · {connections.length}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {connections.map((c) => (
                        <button key={c.id} onClick={() => setSelectedId(c.id)} className="mono" style={{
                          fontSize: 11, padding: '4px 9px', borderRadius: 7, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.03)', border: `1px solid ${colorFor(c.kind)}44`,
                          color: 'var(--white)', display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: colorFor(c.kind) }} />{c.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {open && !note && (
            <div className="mono" style={{ padding: 24, color: noteLoading ? 'var(--silver)' : 'var(--err)', fontSize: 12 }}>
              {noteLoading ? 'loading note…' : 'note not found'}
            </div>
          )}
        </aside>
      </section>

      <style>{`
        .note-md { color: var(--txt); font-size: 13.5px; line-height: 1.62; }
        .note-md h1, .note-md h2, .note-md h3 { color: var(--white); line-height: 1.25; margin: 18px 0 8px; font-weight: 600; }
        .note-md h1 { font-size: 18px; } .note-md h2 { font-size: 15.5px; } .note-md h3 { font-size: 13.5px; }
        .note-md p { margin: 9px 0; }
        .note-md ul, .note-md ol { margin: 8px 0; padding-left: 20px; }
        .note-md li { margin: 3px 0; }
        .note-md blockquote { margin: 10px 0; padding: 8px 12px; border-left: 2px solid rgba(215,218,226,0.35); background: rgba(215,218,226,0.05); border-radius: 0 6px 6px 0; color: var(--txt-mid); }
        .note-md code { font-family: var(--mono); font-size: 12px; background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; }
        .note-md pre { background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 8px; padding: 11px; overflow-x: auto; }
        .note-md pre code { background: none; padding: 0; }
        .note-md table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 12px; display: block; overflow-x: auto; }
        .note-md th, .note-md td { border: 1px solid var(--line); padding: 5px 9px; text-align: left; }
        .note-md th { background: rgba(255,255,255,0.03); color: var(--white); }
        .note-md hr { border: none; border-top: 1px solid var(--line); margin: 16px 0; }
        .note-md strong { color: var(--white); }
      `}</style>
    </div>
  );
}
