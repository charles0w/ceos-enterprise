'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditPlan, RenderQuality } from '@/lib/social/plan';
import { planDuration, clipDuration } from '@/lib/social/plan';
import { saveMedia, deleteMedia, hasMedia, getMedia, persistHint, storageEstimate } from '@/lib/social/mediaStore';
import { probeFile, extractFrames, kindForMime } from '@/lib/social/probe';
import { renderPlan, extractAudioDataUri, type RenderAssetMeta, type RenderProgress } from '@/lib/social/render';
import { uploadToCloudinary } from '@/lib/social/cloudinary';

const C = { cyan: '#2fd4e6', green: '#39d98a', amber: '#f5a623', red: '#ef5350', violet: '#a78bfa' };
const PROJECT_ID = 'studio-main';
const LS_KEY = 'social-studio:project';

// ── types ─────────────────────────────────────────────────────
interface TranscriptSeg { start: number; end: number; text: string }
interface AssetView {
  id: string; name: string; kind: 'video' | 'image' | 'audio';
  mime: string | null; size_bytes: number | null; duration: number | null;
  width: number | null; height: number | null; thumb: string | null;
  transcript: { text: string; segments: TranscriptSeg[] } | null;
  cloud_url: string | null;
  onDevice: boolean;
}
interface RefView {
  id: string; url: string | null; title: string | null; author: string | null;
  provider: string | null; thumb_url: string | null; notes: string | null;
}
interface Msg { role: 'user' | 'assistant'; text: string; frames?: string[]; planUpdated?: boolean }
interface RenderState {
  phase: 'idle' | 'rendering' | 'done' | 'error';
  progress?: RenderProgress;
  log?: string;
  url?: string; size?: number; fileName?: string;
  blob?: Blob;
  error?: string;
}
interface PublishState {
  phase: 'idle' | 'uploading' | 'done' | 'error';
  pct?: number;
  url?: string;
  error?: string;
}
interface SuggestData {
  topic: string;
  findings: { title: string; url?: string; takeaway: string }[];
  hooks: string[];
  captions: string[];
  hashtags: string[];
  editingTips: string[];
  sources: { title: string; url: string }[];
}
interface SuggestState {
  phase: 'idle' | 'loading' | 'done' | 'error';
  data?: SuggestData;
  error?: string;
}
const LS_SUGGEST = 'social-studio:suggestions';

// ── helpers ───────────────────────────────────────────────────
const fmtDur = (s: number | null | undefined) =>
  s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)}s`;
const fmtBytes = (b: number | null | undefined) =>
  b == null ? '' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
const kindIcon = (k: string) => (k === 'video' ? '▶' : k === 'image' ? '▣' : '♫');
const kindColor = (k: string) => (k === 'video' ? C.cyan : k === 'image' ? C.violet : C.green);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `${url} failed (${res.status})`);
  return data as T;
}

// ══════════════════════════════════════════════════════════════
export function SocialStudio() {
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [references, setReferences] = useState<RefView[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [transcribing, setTranscribing] = useState<Set<string>>(new Set());
  const [pendingFrames, setPendingFrames] = useState<{ from: string; frames: string[] } | null>(null);
  const [quality, setQuality] = useState<RenderQuality>('draft');
  const [render, setRender] = useState<RenderState>({ phase: 'idle' });
  const [publish, setPublish] = useState<PublishState>({ phase: 'idle' });
  const [cloudSync, setCloudSync] = useState<Record<string, number>>({});
  const [refUrl, setRefUrl] = useState('');
  const [refNotes, setRefNotes] = useState('');
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [suggest, setSuggest] = useState<SuggestState>({ phase: 'idle' });
  const [topicInput, setTopicInput] = useState('');
  const [tagsCopied, setTagsCopied] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  // ── initial load (API first, localStorage fallback) ──────────
  useEffect(() => {
    (async () => {
      try {
        const [a, r] = await Promise.all([
          api<{ assets: Omit<AssetView, 'onDevice'>[] }>('/api/social/assets'),
          api<{ references: RefView[] }>('/api/social/references'),
        ]);
        const withDevice = await Promise.all(
          a.assets.map(async (x) => ({ ...x, onDevice: await hasMedia(x.id) })),
        );
        setAssets(withDevice);
        setReferences(r.references);
      } catch (e) {
        setError(`Library sync unavailable (${String(e instanceof Error ? e.message : e)}) — working from this device only.`);
      }
      try {
        const p = await api<{ project: { plan: EditPlan | null; messages: Msg[]; title: string } }>(
          `/api/social/projects?id=${PROJECT_ID}`,
        );
        setPlan(p.project.plan);
        setMessages(Array.isArray(p.project.messages) ? p.project.messages : []);
      } catch {
        try {
          const cached = JSON.parse(localStorage.getItem(LS_KEY) || 'null') as { plan: EditPlan | null; messages: Msg[] } | null;
          if (cached) { setPlan(cached.plan); setMessages(cached.messages ?? []); }
        } catch { /* nothing cached */ }
      }
      setStorage(await storageEstimate());
      try {
        const cached = JSON.parse(localStorage.getItem(LS_SUGGEST) || 'null') as SuggestData | null;
        if (cached) setSuggest({ phase: 'done', data: cached });
      } catch { /* nothing cached */ }
    })();
  }, []);

  // ── persist plan + chat (debounced; localStorage mirror) ─────
  const persist = useCallback((nextPlan: EditPlan | null, nextMessages: Msg[]) => {
    const stripped = nextMessages.slice(-60).map(({ frames: _f, ...m }) => m);
    try { localStorage.setItem(LS_KEY, JSON.stringify({ plan: nextPlan, messages: stripped })); } catch { /* full */ }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api('/api/social/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: PROJECT_ID, title: nextPlan?.title ?? undefined, plan: nextPlan, messages: stripped }),
      }).catch(() => { /* best-effort */ });
    }, 1200);
  }, []);

  // ── library ───────────────────────────────────────────────────
  const ingestFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading((n) => n + list.length);
    persistHint();
    for (const file of list) {
      try {
        const id = crypto.randomUUID();
        await saveMedia(id, file);
        const probe = await probeFile(file);
        const view: AssetView = {
          id, name: file.name, kind: probe.kind, mime: file.type || null,
          size_bytes: file.size, duration: probe.duration, width: probe.width, height: probe.height,
          thumb: probe.thumb, transcript: null, cloud_url: null, onDevice: true,
        };
        setAssets((prev) => [view, ...prev]);
        api('/api/social/assets', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id, name: file.name, kind: probe.kind, mime: file.type || null, sizeBytes: file.size,
            duration: probe.duration, width: probe.width, height: probe.height, thumb: probe.thumb,
          }),
        }).catch(() => { /* metadata sync is best-effort */ });
      } catch (e) {
        setError(`Couldn't add ${file.name}: ${String(e instanceof Error ? e.message : e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    setStorage(await storageEstimate());
  }, []);

  const removeAsset = useCallback(async (id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    await deleteMedia(id);
    api(`/api/social/assets?id=${id}`, { method: 'DELETE' }).catch(() => { /* best-effort */ });
  }, []);

  const transcribe = useCallback(async (asset: AssetView) => {
    setTranscribing((s) => new Set(s).add(asset.id));
    setError(null);
    try {
      const meta: RenderAssetMeta = { id: asset.id, kind: asset.kind, mime: asset.mime, name: asset.name };
      const audioDataUri = await extractAudioDataUri(asset.id, meta);
      const out = await api<{ transcript: { text: string; segments: TranscriptSeg[] } }>('/api/social/transcribe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id, audioDataUri }),
      });
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, transcript: out.transcript } : a)));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setTranscribing((s) => { const n = new Set(s); n.delete(asset.id); return n; });
    }
  }, []);

  const syncAssetToCloud = useCallback(async (asset: AssetView) => {
    setError(null);
    setCloudSync((m) => ({ ...m, [asset.id]: 0 }));
    try {
      const file = await getMedia(asset.id);
      if (!file) throw new Error('file is not on this device');
      const up = await uploadToCloudinary(file, {
        folder: 'ceos-social/library',
        publicId: asset.id,
        onProgress: (r) => setCloudSync((m) => ({ ...m, [asset.id]: r })),
      });
      await api('/api/social/assets', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: asset.id, name: asset.name, kind: asset.kind, cloudUrl: up.secureUrl }),
      });
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, cloud_url: up.secureUrl } : a)));
    } catch (e) {
      setError(`Cloud sync: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setCloudSync((m) => { const n = { ...m }; delete n[asset.id]; return n; });
    }
  }, []);

  const attachFrames = useCallback(async (asset: AssetView) => {
    setError(null);
    try {
      const file = await getMedia(asset.id);
      if (!file) throw new Error('file is not on this device');
      const frames = await extractFrames(file, 3);
      setPendingFrames({ from: asset.name, frames });
    } catch (e) {
      setError(`Frames: ${String(e instanceof Error ? e.message : e)}`);
    }
  }, []);

  // ── references ────────────────────────────────────────────────
  const addReference = useCallback(async () => {
    const url = refUrl.trim();
    const notes = refNotes.trim();
    if (!url && !notes) return;
    setError(null);
    try {
      await api('/api/social/references', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url || undefined, notes: notes || undefined }),
      });
      const r = await api<{ references: RefView[] }>('/api/social/references');
      setReferences(r.references);
      setRefUrl(''); setRefNotes('');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, [refUrl, refNotes]);

  const removeReference = useCallback(async (id: string) => {
    setReferences((prev) => prev.filter((r) => r.id !== id));
    api(`/api/social/references?id=${id}`, { method: 'DELETE' }).catch(() => { /* best-effort */ });
  }, []);

  // ── chat ──────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingFrames) || busy) return;
    setError(null);
    const userMsg: Msg = {
      role: 'user',
      text: text || `(frames from "${pendingFrames?.from}")`,
      frames: pendingFrames?.frames,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setPendingFrames(null);
    setBusy(true);
    try {
      const data = await api<{ reply: string; plan: EditPlan | null }>('/api/social/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, text: m.text, frames: m.frames })),
          currentPlan: plan,
        }),
      });
      const newPlan = data.plan ?? plan;
      const withReply = [...next, { role: 'assistant' as const, text: data.reply, planUpdated: !!data.plan }];
      setMessages(withReply);
      if (data.plan) setPlan(data.plan);
      persist(newPlan, withReply);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, plan, pendingFrames, persist]);

  // ── render ────────────────────────────────────────────────────
  const startRender = useCallback(async () => {
    if (!plan || render.phase === 'rendering') return;
    setRender({ phase: 'rendering' });
    setPublish({ phase: 'idle' });
    try {
      const map = new Map<string, RenderAssetMeta>();
      const ids = [...plan.clips.map((c) => c.assetId), ...(plan.music ? [plan.music.assetId] : [])];
      for (const id of ids) {
        const a = assets.find((x) => x.id === id);
        if (!a) throw new Error(`plan uses an asset that's gone from the library (${id.slice(0, 8)}…)`);
        map.set(id, { id: a.id, kind: a.kind, mime: a.mime, name: a.name, cloudUrl: a.cloud_url });
      }
      const out = await renderPlan(plan, map, quality, (p) => {
        setRender((r) => ({
          ...r, phase: 'rendering', progress: p,
          log: p.logLine ?? r.log,
        }));
      });
      const fileName = `${(plan.title ?? 'social-cut').replace(/[^\w-]+/g, '-').toLowerCase()}-${out.width}x${out.height}.mp4`;
      setRender((r) => {
        if (r.url) URL.revokeObjectURL(r.url);
        return { phase: 'done', url: URL.createObjectURL(out.blob), size: out.blob.size, fileName, blob: out.blob };
      });
    } catch (e) {
      setRender({ phase: 'error', error: String(e instanceof Error ? e.message : e) });
    }
  }, [plan, quality, assets, render.phase]);

  const publishToCloud = useCallback(async () => {
    if (!render.blob || !render.fileName || publish.phase === 'uploading') return;
    setPublish({ phase: 'uploading', pct: 0 });
    try {
      const up = await uploadToCloudinary(render.blob, {
        folder: 'ceos-social/renders',
        publicId: `${render.fileName.replace(/\.mp4$/, '')}-${Date.now().toString(36)}`,
        onProgress: (r) => setPublish({ phase: 'uploading', pct: r }),
      });
      api('/api/social/projects', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: PROJECT_ID, output: { cloudUrl: up.secureUrl, fileName: render.fileName, size: render.size, at: new Date().toISOString() } }),
      }).catch(() => { /* best-effort */ });
      setPublish({ phase: 'done', url: up.secureUrl });
    } catch (e) {
      setPublish({ phase: 'error', error: String(e instanceof Error ? e.message : e) });
    }
  }, [render.blob, render.fileName, render.size, publish.phase]);

  // ── trend research ────────────────────────────────────────────
  const runResearch = useCallback(async () => {
    if (suggest.phase === 'loading') return;
    setSuggest({ phase: 'loading' });
    try {
      const data = await api<SuggestData>('/api/social/suggest', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: topicInput.trim() || undefined }),
      });
      setSuggest({ phase: 'done', data });
      try { localStorage.setItem(LS_SUGGEST, JSON.stringify(data)); } catch { /* full */ }
    } catch (e) {
      setSuggest({ phase: 'error', error: String(e instanceof Error ? e.message : e) });
    }
  }, [suggest.phase, topicInput]);

  const copyHashtags = useCallback(async () => {
    const tags = suggest.data?.hashtags ?? [];
    if (!tags.length) return;
    try {
      await navigator.clipboard.writeText(tags.join(' '));
      setTagsCopied(true);
      setTimeout(() => setTagsCopied(false), 1600);
    } catch { setError('Clipboard blocked — select and copy the tags manually.'); }
  }, [suggest.data]);

  const briefEditor = useCallback(() => {
    const d = suggest.data;
    if (!d) return;
    const brief = [
      `Apply this research on "${d.topic}" to the cut:`,
      d.hooks[0] ? `- Open with a hook like: "${d.hooks[0]}"` : '',
      ...d.editingTips.slice(0, 3).map((t) => `- ${t}`),
      d.captions[0] ? `- Caption style: ${d.captions[0]}` : '',
    ].filter(Boolean).join('\n');
    setInput(brief);
  }, [suggest.data]);

  const totalDur = plan ? planDuration(plan) : 0;

  // ── layout ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '26px 22px 30px', maxWidth: 1640, margin: '0 auto' }}>
      <Header />
      {error && (
        <div className="mono" style={{ margin: '0 0 14px', fontSize: 11.5, color: C.amber, border: `1px solid ${C.amber}44`, background: `${C.amber}11`, borderRadius: 9, padding: '7px 11px' }}>
          ⚠ {error} <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', fontSize: 11 }}>dismiss</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 290px) minmax(420px, 1fr) minmax(300px, 350px)', gap: 16, flex: 1, alignItems: 'start' }}>

        {/* ════ LIBRARY ════ */}
        <section
          className="panel ticks"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); ingestFiles(e.dataTransfer.files); }}
          style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 150px)', overflow: 'hidden', outline: dragOver ? `1.5px dashed ${C.cyan}` : 'none', outlineOffset: -6 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="label">Library · local-first</span>
            <button onClick={() => fileInput.current?.click()} className="mono" style={btnStyle(C.cyan)}>+ add</button>
            <input ref={fileInput} type="file" multiple accept="video/*,image/*,audio/*" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files) ingestFiles(e.target.files); e.target.value = ''; }} />
          </div>

          <div style={{ border: `1px dashed ${dragOver ? C.cyan : 'var(--line-2)'}`, borderRadius: 10, padding: '12px 10px', textAlign: 'center', color: dragOver ? C.cyan : 'var(--txt-dim)', fontSize: 12 }}>
            {uploading > 0 ? `ingesting ${uploading}…` : 'drag & drop videos, images, music'}
            <div className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)', marginTop: 4 }}>files stay on this device — never uploaded</div>
          </div>

          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
            {assets.length === 0 && uploading === 0 && (
              <div style={{ color: 'var(--txt-faint)', fontSize: 12, padding: '8px 2px' }}>Library is empty. Drop your raw content here to get started.</div>
            )}
            {assets.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 9, border: '1px solid var(--line)', borderRadius: 10, padding: 8, background: 'var(--panel-2)' }}>
                <div style={{ width: 52, height: 52, borderRadius: 7, overflow: 'hidden', background: '#0a0e13', flexShrink: 0, display: 'grid', placeItems: 'center', border: '1px solid var(--line)' }}>
                  {a.thumb
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={a.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: kindColor(a.kind), fontSize: 18 }}>{kindIcon(a.kind)}</span>}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={a.name}>{a.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--txt-dim)', marginTop: 2 }}>
                    <span style={{ color: kindColor(a.kind) }}>{a.kind}</span> · {fmtDur(a.duration)} · {fmtBytes(a.size_bytes)}
                    {!a.onDevice && !a.cloud_url && <span style={{ color: C.amber }}> · not on this device</span>}
                    {a.cloud_url && <span style={{ color: C.cyan }}> · ☁{!a.onDevice ? ' cloud' : ''}</span>}
                    {a.transcript && <span style={{ color: C.green }}> · ⊟ transcript</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                    <button className="mono" style={chipStyle('var(--txt-dim)')} title="use this asset id in your prompt"
                      onClick={() => setInput((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}"${a.name}"`)}>↪ mention</button>
                    {a.kind !== 'image' && a.onDevice && (
                      <button className="mono" style={chipStyle(a.transcript ? 'var(--txt-faint)' : C.green)} disabled={transcribing.has(a.id)}
                        onClick={() => transcribe(a)}>
                        {transcribing.has(a.id) ? '…transcribing' : a.transcript ? 're-transcribe' : '⊟ transcribe'}
                      </button>
                    )}
                    {a.kind === 'video' && a.onDevice && (
                      <button className="mono" style={chipStyle(C.violet)} onClick={() => attachFrames(a)}>⊡ frames→chat</button>
                    )}
                    {a.onDevice && !a.cloud_url && (
                      <button className="mono" style={chipStyle(C.cyan)} disabled={cloudSync[a.id] !== undefined}
                        title="back up to Cloudinary — renderable from any device"
                        onClick={() => syncAssetToCloud(a)}>
                        {cloudSync[a.id] !== undefined ? `↑ ${Math.round(cloudSync[a.id] * 100)}%` : '↑ cloud'}
                      </button>
                    )}
                    <button className="mono" style={chipStyle(C.red)} onClick={() => removeAsset(a.id)}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {storage && storage.quota > 0 && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              device storage {fmtBytes(storage.usage)} / {fmtBytes(storage.quota)}
            </div>
          )}
        </section>

        {/* ════ AGENT CHAT ════ */}
        <section className="panel ticks" style={{ padding: 16, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
            <span className="label">Editor agent</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>sonnet 4.6 · plans the cut, renders locally</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 2px' }}>
            {messages.length === 0 && (
              <div style={{ color: 'var(--txt-dim)', fontSize: 13, lineHeight: 1.6 }}>
                Drop content in the library, then direct your editor. It designs the cut as an edit plan; you render and download on the right.
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                  {[
                    'Cut a 30s 9:16 TikTok from my clips — fast pacing, captions on',
                    'Use the transcript: keep the strongest lines, kill dead air',
                    'Hook in the first 1.5s, payoff at the end, music under it',
                    'Match the vibe of my reference videos',
                  ].map((q) => (
                    <button key={q} className="mono" onClick={() => setInput(q)}
                      style={{ ...chipStyle(C.cyan), fontSize: 11, padding: '5px 10px' }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '90%', padding: '10px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? 'rgba(47,212,230,0.08)' : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${m.role === 'user' ? C.cyan + '33' : 'var(--line)'}`,
                  color: m.role === 'user' ? '#eafcff' : 'var(--txt)',
                }}>
                  {m.frames && m.frames.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
                      {m.frames.map((f, j) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={j} src={f} alt="" style={{ width: 44, height: 70, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--line-2)' }} />
                      ))}
                    </div>
                  )}
                  {m.text}
                </div>
                {m.planUpdated && (
                  <div className="mono" style={{ fontSize: 10, color: C.green, marginTop: 4 }}>✦ edit plan updated</div>
                )}
              </div>
            ))}
            {busy && <div className="mono" style={{ fontSize: 11.5, color: C.cyan }}>editor is cutting…</div>}
            <div ref={endRef} />
          </div>

          {pendingFrames && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: `1px solid ${C.violet}44`, borderRadius: 9, marginBottom: 8, background: `${C.violet}0d` }}>
              {pendingFrames.frames.map((f, j) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={j} src={f} alt="" style={{ width: 30, height: 48, objectFit: 'cover', borderRadius: 4 }} />
              ))}
              <span className="mono" style={{ fontSize: 10.5, color: C.violet }}>frames from “{pendingFrames.from}” attached</span>
              <button onClick={() => setPendingFrames(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer' }}>✕</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 9, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Direct your editor…  (Enter to send)"
              rows={2}
              style={{ flex: 1, resize: 'none', background: 'rgba(255,255,255,0.03)', color: '#eafcff', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' }}
            />
            <button onClick={send} disabled={busy || (!input.trim() && !pendingFrames)} style={{
              alignSelf: 'stretch', padding: '0 16px', borderRadius: 10, border: `1px solid ${C.cyan}55`,
              background: busy || (!input.trim() && !pendingFrames) ? 'rgba(255,255,255,0.04)' : 'rgba(47,212,230,0.12)',
              color: busy || (!input.trim() && !pendingFrames) ? 'var(--txt-faint)' : C.cyan,
              fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            }}>Cut</button>
          </div>
        </section>

        {/* ════ PLAN + RENDER + REFERENCES ════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>

          {/* plan */}
          <section className="panel ticks" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span className="label">Edit plan</span>
              {plan && <span className="mono tnum" style={{ fontSize: 11, color: C.cyan }}>{plan.aspect} · {fmtDur(totalDur)} · {plan.clips.length} clips</span>}
            </div>
            {!plan ? (
              <div style={{ color: 'var(--txt-faint)', fontSize: 12, marginTop: 10 }}>No plan yet — ask the editor for a first cut.</div>
            ) : (
              <>
                {plan.title && <div style={{ fontSize: 13.5, color: '#eef6f9', fontWeight: 600, marginTop: 9 }}>{plan.title}</div>}
                <div style={{ display: 'flex', gap: 3, marginTop: 10, height: 34, borderRadius: 7, overflow: 'hidden' }}>
                  {plan.clips.map((c, i) => {
                    const a = assets.find((x) => x.id === c.assetId);
                    const wPct = totalDur > 0 ? (clipDuration(c) / totalDur) * 100 : 100 / plan.clips.length;
                    return (
                      <div key={i} title={`${a?.name ?? c.assetId} · ${c.in.toFixed(1)}–${c.out.toFixed(1)}s${c.speed && c.speed !== 1 ? ` · ${c.speed}x` : ''}${c.filter && c.filter !== 'none' ? ` · ${c.filter}` : ''}`}
                        style={{
                          width: `${wPct}%`, minWidth: 10, background: `linear-gradient(180deg, ${kindColor(a?.kind ?? 'video')}33, ${kindColor(a?.kind ?? 'video')}18)`,
                          border: `1px solid ${kindColor(a?.kind ?? 'video')}55`, borderRadius: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                        }}>
                        <span className="mono" style={{ fontSize: 8.5, color: 'var(--txt-mid)', whiteSpace: 'nowrap' }}>{c.label ?? `c${i + 1}`}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <span>⊟ {(plan.captions ?? []).length} captions</span>
                  <span>♫ {plan.music ? (assets.find((a) => a.id === plan.music!.assetId)?.name ?? 'music').slice(0, 22) : 'no music'}</span>
                  <span>{plan.fps ?? 30} fps</span>
                </div>
                {plan.notes && <div style={{ fontSize: 11.5, color: 'var(--txt-mid)', marginTop: 8, fontStyle: 'italic' }}>“{plan.notes}”</div>}
              </>
            )}
          </section>

          {/* render */}
          <section className="panel ticks" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="label">Render · in-browser</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value as RenderQuality)} className="mono"
                style={{ background: 'var(--panel-2)', color: 'var(--txt)', border: '1px solid var(--line)', borderRadius: 7, fontSize: 11, padding: '3px 7px' }}>
                <option value="draft">draft · 540p fast</option>
                <option value="final">final · 1080p HQ</option>
              </select>
            </div>

            <button onClick={startRender} disabled={!plan || render.phase === 'rendering'} style={{
              width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10,
              border: `1px solid ${!plan || render.phase === 'rendering' ? 'var(--line)' : C.green + '66'}`,
              background: !plan || render.phase === 'rendering' ? 'rgba(255,255,255,0.03)' : 'rgba(57,217,138,0.12)',
              color: !plan || render.phase === 'rendering' ? 'var(--txt-faint)' : C.green,
              fontSize: 13.5, fontWeight: 600, cursor: !plan || render.phase === 'rendering' ? 'default' : 'pointer',
            }}>
              {render.phase === 'rendering' ? 'rendering…' : `⬢ Render ${quality === 'final' ? '1080p' : 'draft'}`}
            </button>

            {render.phase === 'rendering' && render.progress && (
              <div style={{ marginTop: 12 }}>
                <div className="mono" style={{ fontSize: 10.5, color: C.cyan }}>
                  [{render.progress.stageIndex + 1}/{render.progress.stageCount}] {render.progress.stage}
                </div>
                <div style={{ height: 5, background: 'var(--panel-2)', borderRadius: 99, marginTop: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99, transition: 'width .3s',
                    width: `${Math.round(((render.progress.stageIndex + Math.max(0, render.progress.stageRatio)) / render.progress.stageCount) * 100)}%`,
                    background: `linear-gradient(90deg, ${C.cyan}, ${C.green})`,
                  }} />
                </div>
                {render.log && <div className="mono" style={{ fontSize: 9, color: 'var(--txt-faint)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{render.log}</div>}
                <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', marginTop: 4 }}>single-thread wasm — long clips take a few minutes; keep this tab open</div>
              </div>
            )}

            {render.phase === 'error' && (
              <div className="mono" style={{ marginTop: 10, fontSize: 11, color: C.red, whiteSpace: 'pre-wrap' }}>⚠ {render.error}</div>
            )}

            {render.phase === 'done' && render.url && (
              <div style={{ marginTop: 12 }}>
                <video src={render.url} controls playsInline style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line-2)', background: '#000', maxHeight: 340 }} />
                <a href={render.url} download={render.fileName} className="mono" style={{
                  display: 'block', textAlign: 'center', marginTop: 10, padding: '9px 0', borderRadius: 10,
                  border: `1px solid ${C.cyan}66`, background: 'rgba(47,212,230,0.12)', color: C.cyan,
                  fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
                }}>⬇ download {render.fileName} · {fmtBytes(render.size)}</a>
                {publish.phase !== 'done' && (
                  <button onClick={publishToCloud} disabled={publish.phase === 'uploading'} className="mono" style={{
                    display: 'block', width: '100%', textAlign: 'center', marginTop: 8, padding: '8px 0', borderRadius: 10,
                    border: `1px solid ${C.violet}55`, background: publish.phase === 'uploading' ? 'rgba(255,255,255,0.03)' : `${C.violet}14`,
                    color: publish.phase === 'uploading' ? 'var(--txt-dim)' : C.violet, fontSize: 12, fontWeight: 600,
                    cursor: publish.phase === 'uploading' ? 'default' : 'pointer',
                  }}>
                    {publish.phase === 'uploading' ? `☁ uploading… ${Math.round((publish.pct ?? 0) * 100)}%` : '☁ publish to cloud (post from phone)'}
                  </button>
                )}
                {publish.phase === 'done' && publish.url && (
                  <div style={{ marginTop: 8, border: `1px solid ${C.green}44`, background: `${C.green}0d`, borderRadius: 10, padding: '8px 10px' }}>
                    <div className="mono" style={{ fontSize: 10.5, color: C.green }}>☁ published — open /social on your phone, or use the link:</div>
                    <a href={publish.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 10, color: C.cyan, wordBreak: 'break-all', textDecoration: 'none' }}>{publish.url}</a>
                  </div>
                )}
                {publish.phase === 'error' && (
                  <div className="mono" style={{ marginTop: 8, fontSize: 10.5, color: C.red }}>⚠ {publish.error}</div>
                )}
                <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', marginTop: 6, textAlign: 'center' }}>ready for Reels / TikTok upload</div>
              </div>
            )}
          </section>

          {/* references */}
          <section className="panel ticks" style={{ padding: 16 }}>
            <span className="label">Inspiration references</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
              <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)} placeholder="TikTok / Reels / YouTube URL"
                style={{ background: 'rgba(255,255,255,0.03)', color: '#eafcff', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={refNotes} onChange={(e) => setRefNotes(e.target.value)} placeholder="why it works (pacing, hook, captions…)"
                  onKeyDown={(e) => { if (e.key === 'Enter') addReference(); }}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.03)', color: '#eafcff', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
                <button onClick={addReference} className="mono" style={btnStyle(C.violet)}>+ add</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
              {references.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid var(--line)', borderRadius: 9, padding: 8, background: 'var(--panel-2)' }}>
                  {r.thumb_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumb_url} alt="" style={{ width: 34, height: 50, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: C.cyan, textDecoration: 'none' }}>{r.title ?? r.url}</a> : (r.title ?? 'note')}
                    </div>
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-dim)' }}>
                      {r.provider}{r.author ? ` · ${r.author}` : ''}
                    </div>
                    {r.notes && <div style={{ fontSize: 11, color: 'var(--txt-mid)', marginTop: 3 }}>{r.notes}</div>}
                  </div>
                  <button onClick={() => removeReference(r.id)} style={{ background: 'none', border: 'none', color: 'var(--txt-faint)', cursor: 'pointer', fontSize: 11 }}>✕</button>
                </div>
              ))}
              {references.length === 0 && (
                <div style={{ color: 'var(--txt-faint)', fontSize: 11.5 }}>Paste videos you want to emulate + a note on why. The editor uses them as style direction. For deeper analysis, add the file to the library and use “frames→chat”.</div>
              )}
            </div>
          </section>

          {/* suggestions / trend research */}
          <section className="panel ticks" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="label">Suggestions · trend research</span>
              {suggest.phase === 'done' && suggest.data && (
                <button onClick={briefEditor} className="mono" style={chipStyle(C.green)} title="compose a brief for the editor from this research">✦ brief editor</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
              <input value={topicInput} onChange={(e) => setTopicInput(e.target.value)}
                placeholder="niche/topic (blank = infer from my content)"
                onKeyDown={(e) => { if (e.key === 'Enter') runResearch(); }}
                style={{ flex: 1, background: 'rgba(255,255,255,0.03)', color: '#eafcff', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
              <button onClick={runResearch} disabled={suggest.phase === 'loading'} className="mono" style={btnStyle(suggest.phase === 'loading' ? 'var(--txt-faint)' : C.amber)}>
                {suggest.phase === 'loading' ? '…' : '⌕ research'}
              </button>
            </div>

            {suggest.phase === 'loading' && (
              <div className="mono" style={{ fontSize: 11, color: C.amber, marginTop: 10 }}>searching what’s getting traction in your niche… (~20s)</div>
            )}
            {suggest.phase === 'error' && (
              <div className="mono" style={{ fontSize: 11, color: C.red, marginTop: 10 }}>⚠ {suggest.error}</div>
            )}

            {suggest.phase === 'done' && suggest.data && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>niche: <span style={{ color: C.amber }}>{suggest.data.topic}</span></div>

                {suggest.data.findings.length > 0 && (
                  <div>
                    <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>What’s working</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {suggest.data.findings.map((f, i) => (
                        <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '7px 9px', background: 'var(--panel-2)' }}>
                          <div style={{ fontSize: 11.5, color: 'var(--txt)' }}>
                            {f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ color: C.cyan, textDecoration: 'none' }}>{f.title}</a> : f.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--txt-mid)', marginTop: 2 }}>{f.takeaway}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {suggest.data.hooks.length > 0 && (
                  <div>
                    <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>Opening hooks</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {suggest.data.hooks.map((h, i) => (
                        <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                          <button className="mono" style={{ ...chipStyle(C.cyan), flexShrink: 0 }} title="send to editor"
                            onClick={() => setInput(`Open the cut with this hook (captioned in the first 1.5s): "${h}"`)}>↪</button>
                          <span style={{ fontSize: 11.5, color: 'var(--txt)' }}>“{h}”</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {suggest.data.captions.length > 0 && (
                  <div>
                    <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>Caption ideas</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {suggest.data.captions.map((c, i) => (
                        <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                          <button className="mono" style={{ ...chipStyle(C.cyan), flexShrink: 0 }} title="send to editor"
                            onClick={() => setInput(`Use this caption style in the cut: ${c}`)}>↪</button>
                          <span style={{ fontSize: 11.5, color: 'var(--txt-mid)' }}>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {suggest.data.editingTips.length > 0 && (
                  <div>
                    <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>Editing techniques</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {suggest.data.editingTips.map((t, i) => (
                        <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                          <button className="mono" style={{ ...chipStyle(C.violet), flexShrink: 0 }} title="apply via editor"
                            onClick={() => setInput(`Apply this technique to the plan: ${t}`)}>↪</button>
                          <span style={{ fontSize: 11.5, color: 'var(--txt-mid)' }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {suggest.data.hashtags.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="label" style={{ fontSize: 9 }}>Hashtags · for the post</span>
                      <button onClick={copyHashtags} className="mono" style={chipStyle(tagsCopied ? C.green : C.cyan)}>{tagsCopied ? '✓ copied' : '⧉ copy all'}</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {suggest.data.hashtags.map((h, i) => (
                        <span key={i} className="mono" style={{ fontSize: 10, color: C.cyan, border: `1px solid ${C.cyan}33`, borderRadius: 99, padding: '2px 8px', background: `${C.cyan}0a` }}>{h}</span>
                      ))}
                    </div>
                  </div>
                )}

                {suggest.data.sources.length > 0 && (
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    sources: {suggest.data.sources.map((s, i) => (
                      <span key={i}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--txt-dim)', textDecoration: 'none' }}>{s.title.slice(0, 40)}</a></span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {suggest.phase === 'idle' && (
              <div style={{ color: 'var(--txt-faint)', fontSize: 11.5, marginTop: 10 }}>
                Researches videos getting traction in your genre right now (live web search) and turns it into hooks, captions, hashtags and cut techniques. Leave the topic blank to infer from your library, plan and references.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── header ────────────────────────────────────────────────────
function Header() {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--line)' }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.green}66`, display: 'grid', placeItems: 'center', color: C.green, fontSize: 14, boxShadow: '0 0 12px rgba(57,217,138,.35)' }}>✂</span>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#eef6f9' }}>Social Studio</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--txt-dim)' }}>AI editor · local-first media · in-browser ffmpeg render</div>
      </div>
      <a href="/ceo" className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: C.cyan, textDecoration: 'none' }}>◉ CEO</a>
      <a href="/" className="mono" style={{ fontSize: 11, color: C.cyan, textDecoration: 'none' }}>← dashboard</a>
    </header>
  );
}

// ── shared inline styles ──────────────────────────────────────
function btnStyle(color: string): React.CSSProperties {
  return {
    fontSize: 11, color, background: `${color}11`, border: `1px solid ${color}44`,
    borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
  };
}
function chipStyle(color: string): React.CSSProperties {
  return {
    fontSize: 9.5, color, background: 'transparent', border: `1px solid ${color}44`,
    borderRadius: 6, padding: '2px 7px', cursor: 'pointer',
  };
}
