'use client';

// Client-side media probing: duration, dimensions, thumbnails and frame
// extraction — all via <video>/<img> + canvas, no ffmpeg needed.

export interface ProbeResult {
  kind: 'video' | 'image' | 'audio';
  duration: number | null;
  width: number | null;
  height: number | null;
  thumb: string | null; // small data URL
}

export function kindForMime(mime: string, name: string): 'video' | 'image' | 'audio' {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic'].includes(ext)) return 'image';
  return 'video';
}

export function extFor(mime: string | null, name: string): string {
  const fromName = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (fromName && fromName.length <= 5) return fromName;
  const map: Record<string, string> = {
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  };
  return map[mime ?? ''] ?? 'bin';
}

function timeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
  ]);
}

function drawScaled(source: CanvasImageSource, sw: number, sh: number, maxDim: number, mime: string, q: number): string {
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(sw * scale));
  canvas.height = Math.max(2, Math.round(sh * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mime, q);
}

function loadVideo(file: Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error('video metadata failed (codec unsupported in this browser?)'));
  });
}

function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    v.onseeked = () => resolve();
    v.onerror = () => reject(new Error('seek failed'));
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, (v.duration || 1) - 0.05));
  });
}

export async function probeFile(file: File): Promise<ProbeResult> {
  const kind = kindForMime(file.type, file.name);

  if (kind === 'image') {
    try {
      const bmp = await timeout(createImageBitmap(file), 8000, 'image decode');
      const thumb = drawScaled(bmp, bmp.width, bmp.height, 320, 'image/webp', 0.55);
      const out = { kind, duration: null, width: bmp.width, height: bmp.height, thumb: thumb.length < 24_000 ? thumb : null };
      bmp.close();
      return out;
    } catch {
      return { kind, duration: null, width: null, height: null, thumb: null };
    }
  }

  if (kind === 'audio') {
    try {
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.src = URL.createObjectURL(file);
      const duration = await timeout(new Promise<number>((resolve, reject) => {
        a.onloadedmetadata = () => resolve(a.duration);
        a.onerror = () => reject(new Error('audio metadata failed'));
      }), 8000, 'audio probe');
      URL.revokeObjectURL(a.src);
      return { kind, duration: Number.isFinite(duration) ? duration : null, width: null, height: null, thumb: null };
    } catch {
      return { kind, duration: null, width: null, height: null, thumb: null };
    }
  }

  // video
  let v: HTMLVideoElement | null = null;
  try {
    v = await timeout(loadVideo(file), 10_000, 'video probe');
    const duration = Number.isFinite(v.duration) ? v.duration : null;
    let thumb: string | null = null;
    try {
      await timeout(seekTo(v, Math.min(0.6, (duration ?? 2) * 0.15)), 6000, 'thumb seek');
      thumb = drawScaled(v, v.videoWidth, v.videoHeight, 320, 'image/webp', 0.5);
      if (thumb.length >= 24_000) thumb = drawScaled(v, v.videoWidth, v.videoHeight, 200, 'image/webp', 0.4);
      if (thumb.length >= 24_000) thumb = null;
    } catch { /* thumb is optional */ }
    return { kind, duration, width: v.videoWidth || null, height: v.videoHeight || null, thumb };
  } catch {
    // Browser can't decode (e.g. some HEVC) — ffmpeg can still handle it at render time.
    return { kind, duration: null, width: null, height: null, thumb: null };
  } finally {
    if (v) { URL.revokeObjectURL(v.src); v.src = ''; }
  }
}

/** Extract N JPEG frames (≤512px wide) for vision analysis by the agent. */
export async function extractFrames(file: Blob, count = 3): Promise<string[]> {
  const v = await timeout(loadVideo(file), 10_000, 'video load');
  const dur = Number.isFinite(v.duration) ? v.duration : 0;
  const points = count === 1 ? [0.5] : Array.from({ length: count }, (_, i) => (i + 0.5) / count);
  const frames: string[] = [];
  try {
    for (const p of points) {
      await timeout(seekTo(v, dur * p), 6000, 'frame seek');
      frames.push(drawScaled(v, v.videoWidth, v.videoHeight, 512, 'image/jpeg', 0.7));
    }
  } finally {
    URL.revokeObjectURL(v.src);
    v.src = '';
  }
  return frames;
}
