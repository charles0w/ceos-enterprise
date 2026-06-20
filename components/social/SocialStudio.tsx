'use client';

// ── Social Studio — AI short-form editor (black & chrome) ─────
// Skin per social-page.jsx: library / editor agent / plan + render
// + suggestions rail. All logic (IndexedDB media store, probe,
// in-browser ffmpeg render, Cloudinary publish, trend research)
// is unchanged.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditPlan, RenderQuality, PostCopy, PostCopyPlatform } from '@/lib/social/plan';
import { planDuration, clipDuration } from '@/lib/social/plan';
import { saveMedia, deleteMedia, hasMedia, getMedia, persistHint, storageEstimate } from '@/lib/social/mediaStore';
import { probeFile, extractFrames } from '@/lib/social/probe';
import { renderPlan, extractAudioDataUri, type RenderAssetMeta, type RenderProgress } from '@/lib/social/render';
import { uploadToCloudinary } from '@/lib/social/cloudinary';
import type { TrendBrief, BulletKind } from '@/lib/social/trendBrief';
import { PanelHead, ProgressBar, StatusDot } from '../chrome';
import { Nav, PageHeader } from '../Shell';

const PROJECT_ID = 'studio-main';
const LS_KEY = 'social-studio:project';
const LS_SUGGEST = 'social-studio:suggestions';
const LS_POST_COPY = 'social-studio:postCopy';

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
interface BriefState {
  phase: 'idle' | 'loading' | 'generating' | 'done' | 'error';
  brief?: TrendBrief | null;
  error?: string;
}

const BULLET_LABELS: Record<BulletKind, string> = {
  heating: 'heating up',
  steal: 'steal this look',
  cooling: 'cooling',
  hook: 'post hook',
  mover: 'watchlist mover',
};

// ── helpers ───────────────────────────────────────────────────
const fmtDur = (s: number | null | undefined) =>
  s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)}s`;
const fmtBytes = (b: number | null | undefined) =>
  b == null ? '' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
const KIND_GLYPH: Record<string, string> = { video: '▶', image: '▣', audio: '♫' };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `${url} failed (${res.status})`);
  return data as T;
}

// monochrome action chip — color only for destructive / status
function chip(color = 'var(--txt-mid)'): React.CSSProperties {
  return {
    fontSize: 9.5, color, background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--line)', borderRadius: 6, padding: '2.5px 8px',
    cursor: 'pointer', letterSpacing: '0.03em', whiteSpace: 'nowrap',
  };
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
  const [account, setAccount] = useState<'client' | 'ceo0uch'>('client');
  const [tagsCopied, setTagsCopied] = useState(false);
  const [briefState, setBriefState] = useState<BriefState>({ phase: 'loading' });
  const [postCopy, setPostCopy] = useState<PostCopy | null>(null);
  const [copyPlatform, setCopyPlatform] = useState<PostCopyPlatform>('tiktok');
  const [copiedField, setCopiedField] = useState<string | null>(null);

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
        const p = await api<{ project: { plan: EditPlan | null; messages: Msg[]; title: string; post_copy: PostCopy | null } }>(
          `/api/social/projects?id=${PROJECT_ID}`,
        );
        setPlan(p.project.plan);
        setMessages(Array.isArray(p.project.messages) ? p.project.messages : []);
        if (p.project.post_copy) {
          setPostCopy(p.project.post_copy);
          const first = (['tiktok', 'instagram', 'youtube', 'twitter'] as const).find((pl) => p.project.post_copy![pl]);
          if (first) setCopyPlatform(first);
        }
      } catch {
        try {
          const cached = JSON.parse(localStorage.getItem(LS_KEY) || 'null') as { plan: EditPlan | null; messages: Msg[] } | null;
          if (cached) { setPlan(cached.plan); setMessages(cached.messages ?? []); }
        } catch { /* nothing cached */ }
        try {
          const cachedCopy = JSON.parse(localStorage.getItem(LS_POST_COPY) || 'null') as PostCopy | null;
          if (cachedCopy) {
            setPostCopy(cachedCopy);
            const first = (['tiktok', 'instagram', 'youtube', 'twitter'] as const).find((pl) => cachedCopy[pl]);
            if (first) setCopyPlatform(first);
          }
        } catch { /* nothing cached */ }
      }
      setStorage(await storageEstimate());
      try {
        const cached = JSON.parse(localStorage.getItem(LS_SUGGEST) || 'null') as SuggestData | null;
        if (cached) setSuggest({ phase: 'done', data: cached });
      } catch { /* nothing cached */ }
    })();
  }, []);

  // ── the brief (trend desk) ────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { brief } = await api<{ brief: TrendBrief | null }>('/api/social/brief');
        setBriefState({ phase: brief ? 'done' : 'idle', brief });
      } catch {
        setBriefState({ phase: 'idle', brief: null });
      }
    })();
  }, []);

  const generateBrief = useCallback(async () => {
    if (briefState.phase === 'generating') return;
    setBriefState((s) => ({ ...s, phase: 'generating' }));
    try {
      const { brief } = await api<{ brief: TrendBrief }>('/api/social/brief', { method: 'POST' });
      setBriefState({ phase: 'done', brief });
    } catch (e) {
      setBriefState((s) => ({ ...s, phase: 'error', error: String(e instanceof Error ? e.message : e) }));
    }
  }, [briefState.phase]);

  // ── persist plan + chat + post copy (debounced; localStorage mirror) ─────
  const persist = useCallback((nextPlan: EditPlan | null, nextMessages: Msg[], nextPostCopy?: PostCopy | null) => {
    const stripped = nextMessages.slice(-60).map(({ frames: _f, ...m }) => m);
    try { localStorage.setItem(LS_KEY, JSON.stringify({ plan: nextPlan, messages: stripped })); } catch { /* full */ }
    if (nextPostCopy !== undefined) {
      try { localStorage.setItem(LS_POST_COPY, JSON.stringify(nextPostCopy)); } catch { /* full */ }
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api('/api/social/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: PROJECT_ID, title: nextPlan?.title ?? undefined, plan: nextPlan, messages: stripped,
          ...(nextPostCopy !== undefined ? { postCopy: nextPostCopy } : {}),
        }),
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
      const data = await api<{ reply: string; plan: EditPlan | null; postCopy: PostCopy | null }>('/api/social/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, text: m.text, frames: m.frames })),
          currentPlan: plan,
          currentPostCopy: postCopy,
        }),
      });
      const newPlan = data.plan ?? plan;
      const newPostCopy = data.postCopy ?? null;
      const withReply = [...next, { role: 'assistant' as const, text: data.reply, planUpdated: !!data.plan }];
      setMessages(withReply);
      if (data.plan) setPlan(data.plan);
      if (data.postCopy) {
        setPostCopy(data.postCopy);
        const first = (['tiktok', 'instagram', 'youtube', 'twitter'] as const).find((p) => data.postCopy![p]);
        if (first) setCopyPlatform(first);
      }
      persist(newPlan, withReply, newPostCopy || undefined);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, plan, postCopy, pendingFrames, persist]);

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
        body: JSON.stringify({ topic: topicInput.trim() || undefined, account }),
      });
      setSuggest({ phase: 'done', data });
      try { localStorage.setItem(LS_SUGGEST, JSON.stringify(data)); } catch { /* full */ }
    } catch (e) {
      setSuggest({ phase: 'error', error: String(e instanceof Error ? e.message : e) });
    }
  }, [suggest.phase, topicInput, account]);

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
  const paneH = 'calc(100vh - 270px)';

  // ── layout ────────────────────────────────────────────────────
  return (
    <div className="page" style={{ maxWidth: 1320, margin: '0 auto', width: '100%' }}>
      <PageHeader
        title="Social studio."
        sub="Drop content, prompt the cut, render in-browser. The editor agent plans; you direct."
      />
      <Nav active="Social studio" />

      {error && (
        <div className="mono" style={{ margin: '0 0 14px', fontSize: 11.5, color: 'var(--warn)', border: '1px solid rgba(242,193,78,0.3)', background: 'rgba(242,193,78,0.06)', borderRadius: 9, padding: '7px 11px' }}>
          ⚠ {error} <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', fontSize: 11 }}>dismiss</button>
        </div>
      )}

      <div className="studio-grid">

        {/* ════ LIBRARY ════ */}
        <section
          className="panel rise studio-pane"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); ingestFiles(e.dataTransfer.files); }}
          style={{ display: 'flex', flexDirection: 'column', maxHeight: paneH, overflow: 'hidden', outline: dragOver ? '1.5px dashed rgba(215,218,226,0.6)' : 'none', outlineOffset: -6 }}
        >
          <PanelHead title="Library" right={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>local-first</span>
              <button onClick={() => fileInput.current?.click()} className="mono" style={chip('var(--silver)')}>+ add</button>
            </span>
          } />
          <input ref={fileInput} type="file" multiple accept="video/*,image/*,audio/*" style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files) ingestFiles(e.target.files); e.target.value = ''; }} />

          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
            <div style={{
              padding: '14px 12px', borderRadius: 10,
              border: `1px dashed ${dragOver ? 'rgba(215,218,226,0.6)' : 'var(--line-2)'}`,
              textAlign: 'center', flexShrink: 0,
            }}>
              <span className="mono" style={{ fontSize: 10.5, color: dragOver ? 'var(--silver)' : 'var(--txt-dim)' }}>
                {uploading > 0 ? `ingesting ${uploading}…` : 'drop video · image · audio'}
              </span>
              <div className="mono" style={{ fontSize: 9, color: 'var(--txt-faint)', marginTop: 4 }}>files stay on this device — never uploaded</div>
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
              {assets.length === 0 && uploading === 0 && (
                <div className="mono" style={{ color: 'var(--txt-faint)', fontSize: 11, padding: '8px 2px' }}>library is empty — drop raw content to start</div>
              )}
              {assets.map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'rgba(255,255,255,0.015)' }}>
                  <span className="mono" style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center',
                    fontSize: 13, color: 'var(--silver)', border: '1px solid var(--line-2)', background: '#000', overflow: 'hidden',
                  }}>
                    {a.thumb
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : KIND_GLYPH[a.kind]}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={a.name}>{a.name}</div>
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-dim)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.duration != null ? fmtDur(a.duration) + ' · ' : ''}{fmtBytes(a.size_bytes)}
                      {a.width && a.height ? ` · ${a.width}×${a.height}` : ''}
                      {!a.onDevice && !a.cloud_url && <span style={{ color: 'var(--warn)' }}> · not on this device</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                      <button className="mono" style={chip()} title="mention this asset in your prompt"
                        onClick={() => setInput((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}"${a.name}"`)}>↪ mention</button>
                      {a.kind !== 'image' && a.onDevice && (
                        <button className="mono" style={chip(a.transcript ? 'var(--txt-faint)' : 'var(--txt-mid)')} disabled={transcribing.has(a.id)}
                          onClick={() => transcribe(a)}>
                          {transcribing.has(a.id) ? '…transcribing' : a.transcript ? 're-transcribe' : '⊟ transcribe'}
                        </button>
                      )}
                      {a.kind === 'video' && a.onDevice && (
                        <button className="mono" style={chip()} onClick={() => attachFrames(a)}>⊡ frames→chat</button>
                      )}
                      {a.onDevice && !a.cloud_url && (
                        <button className="mono" style={chip('var(--silver)')} disabled={cloudSync[a.id] !== undefined}
                          title="back up to Cloudinary — renderable from any device"
                          onClick={() => syncAssetToCloud(a)}>
                          {cloudSync[a.id] !== undefined ? `↑ ${Math.round(cloudSync[a.id] * 100)}%` : '↑ cloud'}
                        </button>
                      )}
                      <button className="mono" style={chip('var(--err)')} onClick={() => removeAsset(a.id)}>✕</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0 }}>
                    {a.cloud_url && <span className="mono" style={{ fontSize: 8.5, color: 'var(--txt-dim)', letterSpacing: '0.08em' }}>CLOUD</span>}
                    {a.transcript && <span className="mono" style={{ fontSize: 8.5, color: 'var(--ok)', letterSpacing: '0.08em' }}>TRANSCRIBED</span>}
                  </div>
                </div>
              ))}
            </div>

            {storage && storage.quota > 0 && (
              <div style={{ marginTop: 4, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span className="label" style={{ fontSize: 9 }}>device storage</span>
                  <span className="mono tnum" style={{ fontSize: 10, color: 'var(--txt-dim)' }}>{fmtBytes(storage.usage)} / {fmtBytes(storage.quota)}</span>
                </div>
                <ProgressBar value={Math.min(1, storage.usage / storage.quota)} active={false} height={4} />
              </div>
            )}
          </div>
        </section>

        {/* ════ EDITOR AGENT ════ */}
        <section className="panel edge rise studio-pane" style={{ display: 'flex', flexDirection: 'column', height: paneH, minHeight: 460, animationDelay: '80ms' }}>
          <PanelHead title="Editor agent" right={<span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>prompt the cut · renders locally</span>} />

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                      style={{ ...chip('var(--txt-mid)'), fontSize: 10.5, padding: '5px 10px' }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const user = m.role === 'user';
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: user ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '90%', padding: '10px 13px', borderRadius: 11, fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    background: user ? 'rgba(215,218,226,0.07)' : 'rgba(255,255,255,0.022)',
                    border: `1px solid ${user ? 'rgba(215,218,226,0.22)' : 'var(--line)'}`,
                    color: user ? 'var(--white)' : 'var(--txt)',
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
                    <span className="mono" style={{ fontSize: 9, color: 'var(--ok)', letterSpacing: '0.1em', marginTop: 5, whiteSpace: 'nowrap' }}>● PLAN UPDATED</span>
                  )}
                </div>
              );
            })}
            {busy && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--silver)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <StatusDot color="#d7dae2" pulse size={5} /> rewriting the plan…
              </span>
            )}
            <div ref={endRef} />
          </div>

          {pendingFrames && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid rgba(215,218,226,0.25)', borderRadius: 9, margin: '0 12px 8px', background: 'rgba(215,218,226,0.05)' }}>
              {pendingFrames.frames.map((f, j) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={j} src={f} alt="" style={{ width: 30, height: 48, objectFit: 'cover', borderRadius: 4 }} />
              ))}
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--silver)' }}>frames from “{pendingFrames.from}” attached</span>
              <button onClick={() => setPendingFrames(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer' }}>✕</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)' }}>
            <textarea className="field" rows={2} value={input} style={{ flex: 1, fontSize: 12.5 }}
              placeholder="Describe the cut…  (Enter to send)"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="btn-chrome" onClick={send} disabled={busy || (!input.trim() && !pendingFrames)}>Send</button>
          </div>
        </section>

        {/* ════ RAIL: BRIEF · PLAN · RENDER · REFERENCES · SUGGESTIONS ════ */}
        <div className="studio-pane" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: paneH, overflowY: 'auto' }}>

          {/* the brief — trend desk for @ceo.0uch */}
          <section className="panel edge rise" style={{ animationDelay: '120ms' }}>
            <PanelHead title="The brief" right={
              briefState.brief
                ? <span className="mono tnum" style={{ fontSize: 10, color: 'var(--silver)' }}>{briefState.brief.briefDate} · @ceo.0uch</span>
                : <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>trend desk</span>
            } />
            <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {briefState.phase === 'generating' && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--silver)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <StatusDot color="#d7dae2" pulse size={5} /> reading the upstream… (~1 min)
                </span>
              )}
              {briefState.phase === 'error' && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--err)' }}>⚠ {briefState.error}</div>
              )}

              {briefState.brief ? (
                <>
                  {briefState.brief.bullets.map((b, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                        <span className="label" style={{ fontSize: 9, color: b.kind === 'cooling' ? 'var(--txt-faint)' : 'var(--txt-dim)' }}>
                          {BULLET_LABELS[b.kind]}
                        </span>
                        {(b.kind === 'steal' || b.kind === 'hook') && (
                          <button className="mono" style={{ ...chip(), flexShrink: 0 }} title="send to the editor"
                            onClick={() => setInput(b.kind === 'steal'
                              ? `This week's shot from the brief — plan it with what's in my library if possible:\n${b.title} — ${b.body}`
                              : `Use this caption/framing pattern from the brief: ${b.title} — ${b.body}`)}>↪</button>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: b.kind === 'cooling' ? 'var(--txt-mid)' : 'var(--white)', fontWeight: 600, lineHeight: 1.35 }}>{b.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--txt-mid)', lineHeight: 1.5, marginTop: 2 }}>{b.body}</div>
                    </div>
                  ))}
                  {briefState.brief.sources.length > 0 && (
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                      sources: {briefState.brief.sources.map((s, i) => (
                        <span key={i}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--txt-dim)' }}>{s.title.slice(0, 36)}</a></span>
                      ))}
                    </div>
                  )}
                  <button className="mono" onClick={generateBrief} disabled={briefState.phase === 'generating'}
                    style={{ ...chip(), alignSelf: 'flex-start' }}>↻ regenerate</button>
                </>
              ) : briefState.phase !== 'generating' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="mono" style={{ color: 'var(--txt-faint)', fontSize: 10.5, lineHeight: 1.55 }}>
                    five bullets for @ceo.0uch every sunday 9am — what’s heating up upstream (blackbird spyplane · throwing fits · r/malefashion), one shot to steal, one thing to skip. the gate: does a brief change what gets shot?
                  </div>
                  <button className="btn-chrome" onClick={generateBrief} style={{ padding: '8px 0' }}>
                    Generate this week’s brief
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* edit plan */}
          <section className="panel rise" style={{ animationDelay: '140ms' }}>
            <PanelHead title="Edit plan" right={
              plan
                ? <span className="mono tnum" style={{ fontSize: 10, color: 'var(--silver)' }}>{fmtDur(totalDur)} · {plan.aspect}</span>
                : <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>—</span>
            } />
            <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {!plan ? (
                <div className="mono" style={{ color: 'var(--txt-faint)', fontSize: 11, padding: '4px 2px' }}>no plan yet — ask the editor for a first cut</div>
              ) : (
                <>
                  {plan.title && <div style={{ fontSize: 13, color: 'var(--white)', fontWeight: 600, marginBottom: 2 }}>{plan.title}</div>}
                  {plan.clips.map((c, i) => {
                    const a = assets.find((x) => x.id === c.assetId);
                    return (
                      <div key={i}
                        title={`${a?.name ?? c.assetId} · ${c.in.toFixed(1)}–${c.out.toFixed(1)}s${c.speed && c.speed !== 1 ? ` · ${c.speed}x` : ''}${c.filter && c.filter !== 'none' ? ` · ${c.filter}` : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6.5px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'rgba(255,255,255,0.015)' }}>
                        <span className="mono tnum" style={{ fontSize: 9.5, color: 'var(--txt-faint)', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                        <span style={{ fontSize: 12, color: 'var(--txt)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label ?? a?.name ?? `clip ${i + 1}`}</span>
                        <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--silver)', flexShrink: 0 }}>{fmtDur(clipDuration(c))}</span>
                      </div>
                    );
                  })}
                  <div className="mono" style={{ fontSize: 10, color: 'var(--txt-dim)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <span>⊟ {(plan.captions ?? []).length} captions</span>
                    <span>♫ {plan.music ? (assets.find((a) => a.id === plan.music!.assetId)?.name ?? 'music').slice(0, 22) : 'no music'}</span>
                    <span>{plan.fps ?? 30} fps</span>
                  </div>
                  {plan.notes && <div style={{ fontSize: 11, color: 'var(--txt-mid)', marginTop: 2, fontStyle: 'italic' }}>“{plan.notes}”</div>}
                </>
              )}
            </div>
          </section>

          {/* render */}
          <section className="panel rise" style={{ animationDelay: '200ms' }}>
            <PanelHead title="Render" right={<span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>in-browser</span>} />
            <div style={{ padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['draft', 'final'] as const).map((q) => (
                  <button key={q} onClick={() => setQuality(q)} className="mono" style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 10.5, letterSpacing: '0.1em',
                    textTransform: 'uppercase', cursor: 'pointer',
                    border: `1px solid ${quality === q ? 'rgba(215,218,226,0.45)' : 'var(--line)'}`,
                    background: quality === q ? 'rgba(215,218,226,0.08)' : 'transparent',
                    color: quality === q ? 'var(--white)' : 'var(--txt-dim)',
                  }}>{q === 'draft' ? 'draft · 540p' : 'final · 1080p'}</button>
                ))}
              </div>

              {render.phase === 'rendering' && render.progress && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--txt-dim)', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      [{render.progress.stageIndex + 1}/{render.progress.stageCount}] {render.progress.stage.toUpperCase()}
                    </span>
                    <span className="mono tnum" style={{ fontSize: 10, color: 'var(--silver)', flexShrink: 0 }}>
                      {Math.round(((render.progress.stageIndex + Math.max(0, render.progress.stageRatio)) / render.progress.stageCount) * 100)}%
                    </span>
                  </div>
                  <ProgressBar value={(render.progress.stageIndex + Math.max(0, render.progress.stageRatio)) / render.progress.stageCount} active height={5} />
                  {render.log && <div className="mono" style={{ fontSize: 9, color: 'var(--txt-faint)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{render.log}</div>}
                  <div className="mono" style={{ fontSize: 9, color: 'var(--txt-faint)', marginTop: 4 }}>single-thread wasm — keep this tab open</div>
                </div>
              )}

              {render.phase === 'done' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: -2 }}>
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--ok)', letterSpacing: '0.08em' }}>
                    RENDER COMPLETE · {fmtBytes(render.size)}
                  </span>
                  <span className="mono tnum" style={{ fontSize: 10, color: 'var(--silver)' }}>100%</span>
                </div>
              )}

              {render.phase === 'error' && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--err)', whiteSpace: 'pre-wrap' }}>⚠ {render.error}</div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-chrome" onClick={startRender} disabled={!plan || render.phase === 'rendering'} style={{ flex: 1, padding: '9px 0' }}>
                  {render.phase === 'done' ? 'Re-render' : render.phase === 'rendering' ? 'Rendering…' : `Render ${quality}`}
                </button>
                {render.phase === 'done' && publish.phase !== 'done' && (
                  <button className="btn-chrome" onClick={publishToCloud} disabled={publish.phase === 'uploading'}
                    style={{ flex: 1, padding: '9px 0', color: 'var(--ok)', borderColor: 'rgba(63,224,143,0.35)' }}>
                    {publish.phase === 'uploading' ? `↑ ${Math.round((publish.pct ?? 0) * 100)}%` : 'Publish'}
                  </button>
                )}
              </div>

              {render.phase === 'done' && render.url && (
                <div>
                  <video src={render.url} controls playsInline style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line-2)', background: '#000', maxHeight: 320, display: 'block' }} />
                  <a href={render.url} download={render.fileName} className="mono" style={{
                    display: 'block', textAlign: 'center', marginTop: 8, padding: '8px 0', borderRadius: 9,
                    border: '1px solid var(--line-2)', background: 'rgba(255,255,255,0.03)', color: 'var(--silver)',
                    fontSize: 10.5, letterSpacing: '0.04em',
                  }}>⬇ {render.fileName} · {fmtBytes(render.size)}</a>
                  {publish.phase === 'done' && publish.url && (
                    <div style={{ marginTop: 8, border: '1px solid rgba(63,224,143,0.3)', background: 'rgba(63,224,143,0.05)', borderRadius: 9, padding: '8px 10px' }}>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ok)' }}>published — open /social on your phone, or:</div>
                      <a href={publish.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 9.5, color: 'var(--silver)', wordBreak: 'break-all' }}>{publish.url}</a>
                    </div>
                  )}
                  {publish.phase === 'error' && (
                    <div className="mono" style={{ marginTop: 8, fontSize: 10.5, color: 'var(--err)' }}>⚠ {publish.error}</div>
                  )}
                  <div className="mono" style={{ fontSize: 9, color: 'var(--txt-faint)', marginTop: 6, textAlign: 'center' }}>ready for Reels / TikTok upload</div>
                </div>
              )}
            </div>
          </section>

          {/* post copy */}
          <section className="panel rise" style={{ animationDelay: '215ms' }}>
            <PanelHead title="Post copy" right={
              postCopy
                ? <button onClick={() => setInput('Rewrite the post copy for all platforms')} className="mono" style={chip()}>↻ refresh</button>
                : <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>auto after plan</span>
            } />
            <div style={{ padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!postCopy ? (
                <div className="mono" style={{ color: 'var(--txt-faint)', fontSize: 10.5, lineHeight: 1.55 }}>
                  platform captions, hashtags + CTAs — generated automatically after the first plan. ask the editor to "write post copy" to trigger it now.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['tiktok', 'instagram', 'youtube', 'twitter'] as const)
                      .filter((p) => postCopy[p])
                      .map((p) => (
                        <button key={p} onClick={() => setCopyPlatform(p)} className="mono" style={{
                          flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 9, letterSpacing: '0.07em',
                          textTransform: 'lowercase', cursor: 'pointer',
                          border: `1px solid ${copyPlatform === p ? 'rgba(215,218,226,0.45)' : 'var(--line)'}`,
                          background: copyPlatform === p ? 'rgba(215,218,226,0.08)' : 'transparent',
                          color: copyPlatform === p ? 'var(--white)' : 'var(--txt-dim)',
                        }}>{p === 'youtube' ? 'yt' : p === 'instagram' ? 'ig' : p === 'twitter' ? 'x' : p}</button>
                      ))
                    }
                  </div>
                  {(() => {
                    const pp = postCopy[copyPlatform];
                    if (!pp) return null;
                    const twitterMode = copyPlatform === 'twitter';
                    const twitterLen = twitterMode
                      ? pp.caption.length + (pp.hashtags.length ? pp.hashtags.reduce((s, h) => s + h.length + 2, 0) : 0) + (pp.cta ? pp.cta.length + 1 : 0)
                      : 0;
                    const overLimit = twitterMode && twitterLen > 280;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span className="label" style={{ fontSize: 9 }}>caption</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {twitterMode && (
                                <span className="mono" style={{ fontSize: 9, color: overLimit ? 'var(--err)' : 'var(--txt-faint)' }}>
                                  {twitterLen}/280
                                </span>
                              )}
                              <button className="mono" style={chip(copiedField === `${copyPlatform}:caption` ? 'var(--ok)' : undefined)}
                                onClick={async () => {
                                  try { await navigator.clipboard.writeText(pp.caption); setCopiedField(`${copyPlatform}:caption`); setTimeout(() => setCopiedField(null), 1600); } catch { /* blocked */ }
                                }}>
                                {copiedField === `${copyPlatform}:caption` ? '✓' : '⧉'}
                              </button>
                            </div>
                          </div>
                          <div style={{
                            fontSize: 11.5, color: 'var(--txt)', lineHeight: 1.5, padding: '7px 10px', borderRadius: 8,
                            border: `1px solid ${overLimit ? 'rgba(242,100,78,0.4)' : 'var(--line)'}`,
                            background: 'rgba(255,255,255,0.015)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}>
                            {pp.caption}
                          </div>
                        </div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span className="label" style={{ fontSize: 9 }}>hashtags</span>
                            <button className="mono" style={chip(copiedField === `${copyPlatform}:tags` ? 'var(--ok)' : undefined)}
                              onClick={async () => {
                                try { await navigator.clipboard.writeText(pp.hashtags.map((h) => `#${h}`).join(' ')); setCopiedField(`${copyPlatform}:tags`); setTimeout(() => setCopiedField(null), 1600); } catch { /* blocked */ }
                              }}>
                              {copiedField === `${copyPlatform}:tags` ? '✓ copied' : '⧉ copy'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {pp.hashtags.map((h, i) => (
                              <span key={i} className="mono" style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 5, border: '1px solid var(--line)', color: 'var(--silver)', background: 'rgba(255,255,255,0.02)' }}>#{h}</span>
                            ))}
                          </div>
                        </div>
                        {pp.cta && (
                          <div>
                            <span className="label" style={{ fontSize: 9, display: 'block', marginBottom: 4 }}>call to action</span>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--txt-mid)', fontStyle: 'italic' }}>"{pp.cta}"</div>
                          </div>
                        )}
                        <button className="mono"
                          style={{ ...chip(copiedField === `${copyPlatform}:all` ? 'var(--ok)' : 'var(--silver)'), padding: '7px 0', borderRadius: 8, textAlign: 'center', width: '100%' }}
                          onClick={async () => {
                            const full = [pp.caption, '', pp.hashtags.map((h) => `#${h}`).join(' '), pp.cta ?? ''].filter(Boolean).join('\n');
                            try { await navigator.clipboard.writeText(full); setCopiedField(`${copyPlatform}:all`); setTimeout(() => setCopiedField(null), 1600); } catch { /* blocked */ }
                          }}>
                          {copiedField === `${copyPlatform}:all` ? '✓ copied full post' : '⧉ copy full post'}
                        </button>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </section>

          {/* references */}
          <section className="panel rise" style={{ animationDelay: '230ms' }}>
            <PanelHead title="References" right={<span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>style direction</span>} />
            <div style={{ padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <input value={refUrl} onChange={(e) => setRefUrl(e.target.value)} placeholder="TikTok / Reels / YouTube URL"
                className="field" style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8 }} />
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={refNotes} onChange={(e) => setRefNotes(e.target.value)} placeholder="why it works (pacing, hook, captions…)"
                  onKeyDown={(e) => { if (e.key === 'Enter') addReference(); }}
                  className="field" style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 8 }} />
                <button onClick={addReference} className="mono" style={chip('var(--silver)')}>+ add</button>
              </div>
              {references.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid var(--line)', borderRadius: 9, padding: 8, background: 'rgba(255,255,255,0.015)' }}>
                  {r.thumb_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumb_url} alt="" style={{ width: 34, height: 50, objectFit: 'cover', borderRadius: 5, flexShrink: 0, border: '1px solid var(--line-2)' }} />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--silver)' }}>{r.title ?? r.url}</a> : <span style={{ color: 'var(--txt)' }}>{r.title ?? 'note'}</span>}
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
                <div className="mono" style={{ color: 'var(--txt-faint)', fontSize: 10.5, lineHeight: 1.5 }}>
                  paste videos you want to emulate + a note on why — the editor uses them as style direction
                </div>
              )}
            </div>
          </section>

          {/* suggestions / trend research */}
          <section className="panel rise" style={{ animationDelay: '260ms' }}>
            <PanelHead title="Suggestions" right={
              suggest.phase === 'done' && suggest.data
                ? <button onClick={briefEditor} className="mono" style={chip('var(--silver)')} title="compose a brief for the editor from this research">✦ brief editor</button>
                : <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>trend research</span>
            } />
            <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* voice toggle: client work gets generic growth research; the
                  personal account runs on the trend-desk rubric */}
              <div style={{ display: 'flex', gap: 6 }}>
                {([['client', 'client work'], ['ceo0uch', '@ceo.0uch']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setAccount(k)} className="mono" style={{
                    flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 10, letterSpacing: '0.08em',
                    textTransform: 'lowercase', cursor: 'pointer',
                    border: `1px solid ${account === k ? 'rgba(215,218,226,0.45)' : 'var(--line)'}`,
                    background: account === k ? 'rgba(215,218,226,0.08)' : 'transparent',
                    color: account === k ? 'var(--white)' : 'var(--txt-dim)',
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={topicInput} onChange={(e) => setTopicInput(e.target.value)}
                  placeholder={account === 'ceo0uch' ? 'topic (blank = soft tech / ivy gorp)' : 'niche/topic (blank = infer from my content)'}
                  onKeyDown={(e) => { if (e.key === 'Enter') runResearch(); }}
                  className="field" style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 8 }} />
                <button onClick={runResearch} disabled={suggest.phase === 'loading'} className="mono" style={chip(suggest.phase === 'loading' ? 'var(--txt-faint)' : 'var(--silver)')}>
                  {suggest.phase === 'loading' ? '…' : '⌕ research'}
                </button>
              </div>

              {suggest.phase === 'loading' && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--silver)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <StatusDot color="#d7dae2" pulse size={5} /> searching what’s getting traction… (~20s)
                </span>
              )}
              {suggest.phase === 'error' && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--err)' }}>⚠ {suggest.error}</div>
              )}

              {suggest.phase === 'done' && suggest.data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>niche: <span style={{ color: 'var(--white)' }}>{suggest.data.topic}</span></div>

                  {suggest.data.findings.length > 0 && (
                    <div>
                      <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>What’s working</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {suggest.data.findings.map((f, i) => (
                          <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '7px 9px', background: 'rgba(255,255,255,0.015)' }}>
                            <div style={{ fontSize: 11.5 }}>
                              {f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ color: 'var(--silver)' }}>{f.title}</a> : <span style={{ color: 'var(--txt)' }}>{f.title}</span>}
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
                            <button className="mono" style={{ ...chip(), flexShrink: 0 }} title="send to editor"
                              onClick={() => setInput(`Open the cut with this hook (captioned in the first 1.5s): "${h}"`)}>↪</button>
                            <span style={{ fontSize: 11.5, color: 'var(--txt)', lineHeight: 1.45 }}>“{h}”</span>
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
                            <button className="mono" style={{ ...chip(), flexShrink: 0 }} title="send to editor"
                              onClick={() => setInput(`Use this caption style in the cut: ${c}`)}>↪</button>
                            <span style={{ fontSize: 11.5, color: 'var(--txt-mid)', lineHeight: 1.45 }}>{c}</span>
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
                            <button className="mono" style={{ ...chip(), flexShrink: 0 }} title="apply via editor"
                              onClick={() => setInput(`Apply this technique to the plan: ${t}`)}>↪</button>
                            <span style={{ fontSize: 11.5, color: 'var(--txt-mid)', lineHeight: 1.45 }}>{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {suggest.data.hashtags.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                        <span className="label" style={{ fontSize: 9 }}>Hashtags</span>
                        <button onClick={copyHashtags} className="mono" style={chip(tagsCopied ? 'var(--ok)' : 'var(--silver)')}>{tagsCopied ? '✓ copied' : '⧉ copy all'}</button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {suggest.data.hashtags.map((h, i) => (
                          <span key={i} className="mono" style={{
                            fontSize: 10, padding: '3px 8px', borderRadius: 6,
                            border: '1px solid var(--line)', color: 'var(--silver)', background: 'rgba(255,255,255,0.02)',
                          }}>{h}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {suggest.data.sources.length > 0 && (
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                      sources: {suggest.data.sources.map((s, i) => (
                        <span key={i}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--txt-dim)' }}>{s.title.slice(0, 40)}</a></span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {suggest.phase === 'idle' && (
                <div className="mono" style={{ color: 'var(--txt-faint)', fontSize: 10.5, lineHeight: 1.55 }}>
                  researches what’s getting traction in your genre right now (live web search) → hooks, captions, hashtags, cut techniques. blank topic = infer from your library, plan and references
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <p className="mono" style={{ fontSize: 10.5, color: 'var(--txt-faint)', margin: '16px 0 0', textAlign: 'center' }}>
        local-first media · in-browser ffmpeg render · publish to post from your phone
      </p>
    </div>
  );
}
