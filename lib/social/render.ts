'use client';

import { fetchFile } from '@ffmpeg/util';
import {
  type EditPlan, type PlanCaption, type RenderQuality,
  canvasFor, planDuration,
} from './plan';
import {
  buildClipCommands, buildConcatCommand, buildExtractAudioCommand,
  buildMusicCommand, buildOverlayCommand, concatListText, type OverlaySpec,
} from './renderArgs';
import { getFFmpeg, setSinks, execStrict, rmQuiet } from './ffmpegClient';
import { getMedia, saveMedia } from './mediaStore';
import { extFor } from './probe';

// The render orchestrator: EditPlan → MP4 Blob, entirely in the browser.
// Pipeline: per-clip normalize (trim/speed/crop/look/fades → shared codec, TS)
// → lossless concat → caption overlay pass → music mix pass.

export interface RenderAssetMeta {
  id: string;
  kind: 'video' | 'image' | 'audio';
  mime: string | null;
  name: string;
  cloudUrl?: string | null;
}

/** Local OPFS first; fall back to the Cloudinary backup and cache it locally. */
async function getMediaWithCloudFallback(meta: RenderAssetMeta): Promise<Blob | null> {
  const local = await getMedia(meta.id);
  if (local) return local;
  if (!meta.cloudUrl) return null;
  const res = await fetch(meta.cloudUrl);
  if (!res.ok) throw new Error(`cloud fetch failed for "${meta.name}" (${res.status})`);
  const blob = await res.blob();
  try { await saveMedia(meta.id, blob); } catch { /* cache is best-effort */ }
  return blob;
}

export interface RenderProgress {
  stage: string;       // human label
  stageIndex: number;
  stageCount: number;
  stageRatio: number;  // 0–1 within the stage
  logLine?: string;
}

export interface RenderOutput {
  blob: Blob;
  width: number;
  height: number;
  fps: number;
  duration: number;
  quality: RenderQuality;
}

// ── caption PNG rendering (canvas → transparent full-frame overlays) ──
const SIZE_FACTOR = { sm: 0.045, md: 0.058, lg: 0.074 } as const;

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

async function captionPng(cap: PlanCaption, W: number, H: number): Promise<Uint8Array> {
  const s = cap.style ?? {};
  const size = SIZE_FACTOR[s.size ?? 'md'] * W;
  const weight = (s.bold ?? true) ? 800 : 600;
  const color = s.color ?? '#ffffff';
  const accent = s.accentColor ?? '#2fd4e6';
  const bg = s.background ?? 'dark';
  const text = (s.uppercase ? cap.text.toUpperCase() : cap.text).trim();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${weight} ${size}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = wrapLines(ctx, text, W * 0.84);
  const lineH = size * 1.28;
  const blockH = lines.length * lineH;
  const pos = s.position ?? 'bottom';
  // Safe zones: keep clear of platform UI (bottom bar, top icons).
  const centerY =
    pos === 'top' ? H * 0.16 + blockH / 2 :
    pos === 'middle' ? H / 2 :
    H * 0.80 - blockH / 2;

  lines.forEach((ln, i) => {
    const y = centerY - blockH / 2 + lineH * (i + 0.5);
    const tw = ctx.measureText(ln).width;

    if (bg === 'dark' || bg === 'accent') {
      const padX = size * 0.42;
      const padY = size * 0.24;
      const rx = size * 0.3;
      const bx = W / 2 - tw / 2 - padX;
      const by = y - lineH / 2 + (lineH - size) / 2 - padY + size * 0.06;
      const bw = tw + padX * 2;
      const bh = size + padY * 2;
      ctx.fillStyle = bg === 'dark' ? 'rgba(8,10,14,0.78)' : accent;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, rx);
      ctx.fill();
      ctx.fillStyle = bg === 'accent' ? '#0b0e12' : color;
    } else {
      // outline style for max readability on busy footage
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.lineWidth = size * 0.22;
      ctx.strokeText(ln, W / 2, y);
      ctx.fillStyle = color;
    }
    ctx.fillText(ln, W / 2, y);
  });

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('caption PNG failed'))), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

// ── main entry ────────────────────────────────────────────────
export async function renderPlan(
  plan: EditPlan,
  assets: Map<string, RenderAssetMeta>,
  quality: RenderQuality,
  onProgress: (p: RenderProgress) => void,
): Promise<RenderOutput> {
  // Make sure the caption font is ready before drawing to canvas.
  try { await document.fonts.ready; } catch { /* non-blocking */ }

  const logTail: string[] = [];
  let stageIndex = 0;
  let stageLabel = 'preparing';
  const captions = plan.captions ?? [];
  const stageCount = plan.clips.length + 1 + (captions.length ? 1 : 0) + (plan.music ? 1 : 0);

  const emit = (ratio: number, logLine?: string) =>
    onProgress({ stage: stageLabel, stageIndex, stageCount, stageRatio: ratio, logLine });

  setSinks(
    (line) => { logTail.push(line); if (logTail.length > 40) logTail.shift(); emit(-1, line); },
    (r) => emit(r),
  );

  const ff = await getFFmpeg();
  const { w, h } = canvasFor(plan.aspect, quality);
  const fps = plan.fps ?? 30;
  const written: string[] = [];
  const write = async (name: string, data: Uint8Array | Blob) => {
    await ff.writeFile(name, data instanceof Blob ? await fetchFile(data) : data);
    written.push(name);
  };

  try {
    // 1 — normalize each clip
    const clipNames: string[] = [];
    for (let i = 0; i < plan.clips.length; i++) {
      const clip = plan.clips[i];
      const meta = assets.get(clip.assetId);
      if (!meta) throw new Error(`asset ${clip.assetId} missing from library`);
      const file = await getMediaWithCloudFallback(meta);
      if (!file) throw new Error(`"${meta.name}" is not on this device and has no cloud backup — re-add the file or hit "↑ cloud" on the device that has it`);

      stageIndex = i;
      stageLabel = `clip ${i + 1}/${plan.clips.length}${clip.label ? ` · ${clip.label}` : ''}`;
      emit(0);

      const inputName = `in_${i}.${extFor(meta.mime, meta.name)}`;
      await write(inputName, file);
      const cmds = buildClipCommands(plan, i, { kind: meta.kind === 'audio' ? 'video' : meta.kind, inputName }, quality);

      if (cmds.primary) {
        try {
          await execStrict(ff, cmds.primary, logTail);
        } catch {
          // Most common cause: the file has no audio track. Re-run with silence.
          await rmQuiet(ff, cmds.outName);
          await execStrict(ff, cmds.silent, logTail);
        }
      } else {
        await execStrict(ff, cmds.silent, logTail);
      }
      await rmQuiet(ff, inputName);
      clipNames.push(cmds.outName);
      written.push(cmds.outName);
    }

    // 2 — concat
    stageIndex = plan.clips.length;
    stageLabel = 'assembling timeline';
    emit(0);
    await write('list.txt', new Blob([concatListText(clipNames)], { type: 'text/plain' }));
    let current = 'base.mp4';
    await execStrict(ff, buildConcatCommand('list.txt', current), logTail);
    written.push(current);
    for (const n of clipNames) await rmQuiet(ff, n);
    await rmQuiet(ff, 'list.txt');

    // 3 — captions
    if (captions.length) {
      stageIndex += 1;
      stageLabel = `burning ${captions.length} captions`;
      emit(0);
      const overlays: OverlaySpec[] = [];
      for (let i = 0; i < captions.length; i++) {
        const pngName = `cap_${i}.png`;
        await write(pngName, await captionPng(captions[i], w, h));
        overlays.push({ pngName, start: captions[i].start, end: captions[i].end });
      }
      const next = 'with_caps.mp4';
      await execStrict(ff, buildOverlayCommand(current, overlays, quality, next), logTail);
      written.push(next);
      for (const o of overlays) await rmQuiet(ff, o.pngName);
      await rmQuiet(ff, current);
      current = next;
    }

    // 4 — music bed
    if (plan.music) {
      const meta = assets.get(plan.music.assetId);
      const file = meta ? await getMediaWithCloudFallback(meta) : null;
      if (!meta || !file) throw new Error('music asset is not on this device and has no cloud backup');
      stageIndex += 1;
      stageLabel = 'mixing music';
      emit(0);
      const musicName = `music.${extFor(meta.mime, meta.name)}`;
      await write(musicName, file);
      const next = 'with_music.mp4';
      const total = planDuration(plan);
      try {
        await execStrict(ff, buildMusicCommand(current, musicName, plan.music, total, next, true), logTail);
      } catch {
        await rmQuiet(ff, next);
        await execStrict(ff, buildMusicCommand(current, musicName, plan.music, total, next, false), logTail);
      }
      written.push(next);
      await rmQuiet(ff, musicName);
      await rmQuiet(ff, current);
      current = next;
    }

    // 5 — read result
    const data = await ff.readFile(current);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
    const blob = new Blob([bytes.slice()], { type: 'video/mp4' });
    return { blob, width: w, height: h, fps, duration: planDuration(plan), quality };
  } finally {
    for (const n of written) await rmQuiet(ff, n);
    setSinks(null, null);
  }
}

/** Extract small mono audio for Whisper. Returns a data:audio/mp4 URI. */
export async function extractAudioDataUri(
  assetId: string, meta: RenderAssetMeta, onLog?: (l: string) => void,
): Promise<string> {
  const file = await getMedia(assetId);
  if (!file) throw new Error('file is not on this device');
  const logTail: string[] = [];
  setSinks((l) => { logTail.push(l); if (logTail.length > 40) logTail.shift(); onLog?.(l); }, null);
  const ff = await getFFmpeg();
  const inputName = `tr_in.${extFor(meta.mime, meta.name)}`;
  const outName = 'tr_out.m4a';
  try {
    await ff.writeFile(inputName, await fetchFile(file));
    await execStrict(ff, buildExtractAudioCommand(inputName, outName), logTail);
    const data = await ff.readFile(outName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
    if (bytes.length > 3_000_000) {
      throw new Error('audio too long for transcription (~15 min cap) — trim the video first');
    }
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:audio/mp4;base64,${btoa(bin)}`;
  } finally {
    await rmQuiet(ff, inputName);
    await rmQuiet(ff, outName);
    setSinks(null, null);
  }
}
