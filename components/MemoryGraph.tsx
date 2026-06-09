'use client';

import { useEffect, useRef, useState } from 'react';

interface GNode { id: string; title: string; kind: string; degree: number }
interface GLink { source: string; target: string }
interface SimNode extends GNode { x: number; y: number; vx: number; vy: number; r: number }

const KIND_COLOR: Record<string, string> = {
  core: '#2fd4e6', fleet: '#39d98a', entity: '#a78bfa', session: '#f5a623', learning: '#f5a623',
};
const colorFor = (k: string) => KIND_COLOR[k] ?? '#7d8c98';

export function MemoryGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [meta, setMeta] = useState<{ nodes: number; links: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ title: string; kind: string; x: number; y: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    let nodes: SimNode[] = [];
    let links: { s: SimNode; t: SimNode }[] = [];
    // view transform (pan/zoom) and interaction state
    const view = { x: 0, y: 0, scale: 1 };
    let dragNode: SimNode | null = null;
    let panning = false;
    let lastX = 0, lastY = 0;
    let alpha = 1; // cooling factor
    let cancelled = false;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function worldFromScreen(sx: number, sy: number) {
      return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
    }
    function nodeAt(sx: number, sy: number): SimNode | null {
      const p = worldFromScreen(sx, sy);
      for (const n of nodes) {
        const dx = n.x - p.x, dy = n.y - p.y;
        if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
      }
      return null;
    }

    function step() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const cx = w / 2, cy = h / 2;
      // repulsion (O(n^2) — fine for tens of nodes)
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          const f = (3200 * alpha) / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      // spring along links
      for (const l of links) {
        let dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - 90) * 0.015 * alpha;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        l.s.vx += fx; l.s.vy += fy; l.t.vx -= fx; l.t.vy -= fy;
      }
      // gravity to center + integrate
      for (const n of nodes) {
        if (n === dragNode) { n.vx = 0; n.vy = 0; continue; }
        n.vx += (cx - n.x) * 0.0016 * alpha;
        n.vy += (cy - n.y) * 0.0016 * alpha;
        n.vx *= 0.86; n.vy *= 0.86;
        n.x += n.vx; n.y += n.vy;
      }
      if (alpha > 0.04) alpha *= 0.992;
    }

    function draw() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.scale, view.scale);
      // links
      ctx.lineWidth = 0.6 / view.scale;
      ctx.strokeStyle = 'rgba(160,180,190,0.16)';
      ctx.beginPath();
      for (const l of links) { ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); }
      ctx.stroke();
      // nodes
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = colorFor(n.kind);
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function frame() {
      if (cancelled) return;
      step();
      draw();
      raf = requestAnimationFrame(frame);
    }

    // interaction handlers
    const onDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const n = nodeAt(sx, sy);
      if (n) { dragNode = n; alpha = Math.max(alpha, 0.4); }
      else { panning = true; }
      lastX = sx; lastY = sy;
    };
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (dragNode) {
        const p = worldFromScreen(sx, sy);
        dragNode.x = p.x; dragNode.y = p.y;
      } else if (panning) {
        view.x += sx - lastX; view.y += sy - lastY;
      } else {
        const n = nodeAt(sx, sy);
        setHover(n ? { title: n.title, kind: n.kind, x: sx, y: sy } : null);
        canvas.style.cursor = n ? 'pointer' : 'grab';
      }
      lastX = sx; lastY = sy;
    };
    const onUp = () => { dragNode = null; panning = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const ns = Math.min(4, Math.max(0.25, view.scale * factor));
      // zoom toward cursor
      view.x = sx - (sx - view.x) * (ns / view.scale);
      view.y = sy - (sy - view.y) * (ns / view.scale);
      view.scale = ns;
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
        nodes = data.nodes.map((n, i) => {
          const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
          const sn: SimNode = {
            ...n,
            r: 3 + Math.sqrt(n.degree) * 1.7,
            x: w / 2 + Math.cos(angle) * (120 + (i % 7) * 18),
            y: h / 2 + Math.sin(angle) * (120 + (i % 7) * 18),
            vx: 0, vy: 0,
          };
          byId.set(n.id, sn);
          return sn;
        });
        links = data.links
          .map((l) => ({ s: byId.get(l.source)!, t: byId.get(l.target)! }))
          .filter((l) => l.s && l.t);
        setMeta({ nodes: nodes.length, links: links.length });
        canvas.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('resize', resize);
        frame();
      } catch (e) {
        setError(String(e));
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg, #0b0f12)' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* header */}
      <div style={{ position: 'absolute', top: 18, left: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href="/" className="mono" style={{ fontSize: 11, color: '#2fd4e6', textDecoration: 'none' }}>← dashboard</a>
        <span className="label" style={{ color: 'var(--txt-mid)', letterSpacing: '0.2em' }}>AI MEMORY GRAPH</span>
        {meta && <span className="mono" style={{ fontSize: 10.5, color: 'var(--txt-faint)' }}>{meta.nodes} notes · {meta.links} links</span>}
      </div>

      {/* legend */}
      <div style={{ position: 'absolute', bottom: 18, left: 22, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {Object.entries({ core: 'core', fleet: 'fleet', entity: 'entity', session: 'sessions' }).map(([k, label]) => (
          <span key={k} className="mono" style={{ fontSize: 10.5, color: 'var(--txt-dim)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: colorFor(k), display: 'inline-block' }} />{label}
          </span>
        ))}
        <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>drag nodes · scroll to zoom · drag bg to pan</span>
      </div>

      {/* hover label */}
      {hover && (
        <div className="mono" style={{
          position: 'absolute', left: hover.x + 12, top: hover.y + 12, pointerEvents: 'none',
          background: 'rgba(10,15,18,0.92)', border: '1px solid var(--line)', borderRadius: 6,
          padding: '4px 8px', fontSize: 11, color: '#eafcff', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: colorFor(hover.kind) }}>●</span> {hover.title}
        </div>
      )}

      {error && <div className="mono" style={{ position: 'absolute', top: 50, left: 22, color: '#ef5350', fontSize: 12 }}>⚠ {error}</div>}
    </div>
  );
}
