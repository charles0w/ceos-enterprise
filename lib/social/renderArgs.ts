import {
  type EditPlan, type PlanClip, type RenderQuality,
  clipDuration, canvasFor,
} from './plan';

// Pure ffmpeg argument builders for the in-browser renderer. No browser APIs
// here — this module is unit-testable in plain node (see scripts/social-render-test.mjs).

export interface ClipAssetInfo {
  kind: 'video' | 'image' | 'audio';
  inputName: string; // file name in the ffmpeg FS, with extension
}

const enc = (quality: RenderQuality) =>
  quality === 'final'
    ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28'];

const AUDIO_OUT = ['-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', '160k'];

export function atempoChain(speed: number): string {
  const parts: number[] = [];
  let s = speed;
  while (s > 2.0 + 1e-9) { parts.push(2); s /= 2; }
  while (s < 0.5 - 1e-9) { parts.push(0.5); s /= 0.5; }
  parts.push(s);
  return parts.map((p) => `atempo=${p.toFixed(4)}`).join(',');
}

function lookFilter(filter?: string): string | null {
  switch (filter) {
    case 'punch': return 'eq=contrast=1.12:saturation=1.28:brightness=0.01';
    case 'bw':    return 'hue=s=0,eq=contrast=1.12';
    case 'warm':  return 'colorbalance=rm=0.05:bm=-0.05,eq=saturation=1.06';
    case 'cool':  return 'colorbalance=rm=-0.04:bm=0.06';
    case 'vhs':   return 'eq=saturation=0.8:contrast=0.92,gblur=sigma=0.4,noise=alls=7:allf=t';
    case 'faded': return "curves=all='0/0.05 0.5/0.5 1/0.95',eq=saturation=0.88";
    default:      return null;
  }
}

interface FadeSpec { fadeIn?: number; fadeOut?: number }

/** Fade-in comes from the PREVIOUS clip's transitionAfter; fade-out from this clip's. */
export function fadesFor(plan: EditPlan, idx: number): FadeSpec {
  const spec: FadeSpec = {};
  const prev = idx > 0 ? plan.clips[idx - 1] : null;
  if (prev?.transitionAfter?.type === 'fade') spec.fadeIn = prev.transitionAfter.duration ?? 0.4;
  const cur = plan.clips[idx];
  if (idx < plan.clips.length - 1 && cur.transitionAfter?.type === 'fade') {
    spec.fadeOut = cur.transitionAfter.duration ?? 0.4;
  }
  return spec;
}

function videoFilters(clip: PlanClip, w: number, h: number, fps: number, fades: FadeSpec, isImage: boolean): string {
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
  const dur = clipDuration(clip);
  const f: string[] = [];
  if (!isImage) f.push(speed === 1 ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${speed}`);
  f.push(`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`, `fps=${fps}`);
  const look = lookFilter(clip.filter);
  if (look) f.push(look);
  if (fades.fadeIn) f.push(`fade=t=in:st=0:d=${fades.fadeIn}`);
  if (fades.fadeOut) f.push(`fade=t=out:st=${Math.max(0, dur - fades.fadeOut).toFixed(3)}:d=${fades.fadeOut}`);
  f.push('format=yuv420p');
  return f.join(',');
}

function audioFilters(clip: PlanClip, fades: FadeSpec): string {
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
  const dur = clipDuration(clip);
  const f: string[] = ['asetpts=PTS-STARTPTS'];
  if (speed !== 1) f.push(atempoChain(speed));
  const vol = clip.volume ?? 1;
  if (vol !== 1) f.push(`volume=${vol}`);
  if (fades.fadeIn) f.push(`afade=t=in:st=0:d=${fades.fadeIn}`);
  if (fades.fadeOut) f.push(`afade=t=out:st=${Math.max(0, dur - fades.fadeOut).toFixed(3)}:d=${fades.fadeOut}`);
  return f.join(',');
}

export interface ClipCommands {
  /** uses the clip's own audio track (errors if the file has none) */
  primary: string[] | null;
  /** silent-audio variant — used for muted clips, images, or as fallback */
  silent: string[];
  outName: string;
}

/**
 * Build the per-clip normalization command(s). Every clip is re-encoded to the
 * shared canvas + codec params and muxed to MPEG-TS so the concat step is a
 * lossless stream copy.
 */
export function buildClipCommands(
  plan: EditPlan, idx: number, asset: ClipAssetInfo, quality: RenderQuality,
): ClipCommands {
  const clip = plan.clips[idx];
  const { w, h } = canvasFor(plan.aspect, quality);
  const fps = plan.fps ?? 30;
  const fades = fadesFor(plan, idx);
  const dur = clipDuration(clip);
  const rawDur = Math.max(0.01, clip.out - clip.in);
  const outName = `clip_${idx}.ts`;
  const isImage = asset.kind === 'image';

  const vf = videoFilters(clip, w, h, fps, fades, isImage);
  const af = audioFilters(clip, fades);
  const silentSrc = ['-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo'];

  if (isImage) {
    return {
      primary: null,
      silent: [
        '-loop', '1', '-t', rawDur.toFixed(3), '-i', asset.inputName,
        ...silentSrc,
        '-map', '0:v:0', '-map', '1:a:0',
        '-vf', vf,
        ...enc(quality), ...AUDIO_OUT,
        '-shortest', '-f', 'mpegts', outName,
      ],
      outName,
    };
  }

  const inputTrim = ['-ss', clip.in.toFixed(3), '-t', rawDur.toFixed(3), '-i', asset.inputName];
  const silent = [
    ...inputTrim, ...silentSrc,
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', vf,
    ...enc(quality), ...AUDIO_OUT,
    '-shortest', '-f', 'mpegts', outName,
  ];
  if (clip.muted) return { primary: null, silent, outName };

  return {
    primary: [
      ...inputTrim,
      '-map', '0:v:0', '-map', '0:a:0',
      '-vf', vf, '-af', af,
      ...enc(quality), ...AUDIO_OUT,
      '-f', 'mpegts', outName,
    ],
    silent,
    outName,
  };
}

export function concatListText(clipNames: string[]): string {
  return clipNames.map((n) => `file '${n}'`).join('\n') + '\n';
}

export function buildConcatCommand(listName: string, outName: string): string[] {
  return [
    '-f', 'concat', '-safe', '0', '-i', listName,
    '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart',
    outName,
  ];
}

export interface OverlaySpec { pngName: string; start: number; end: number }

/** Burn caption PNGs (full-canvas transparent images) over the video. */
export function buildOverlayCommand(
  videoIn: string, overlays: OverlaySpec[], quality: RenderQuality, outName: string,
): string[] {
  const inputs: string[] = ['-i', videoIn];
  for (const o of overlays) inputs.push('-i', o.pngName);
  let prev = '[0:v]';
  const chains: string[] = [];
  overlays.forEach((o, i) => {
    const label = i === overlays.length - 1 ? '[vout]' : `[v${i + 1}]`;
    chains.push(`${prev}[${i + 1}:v]overlay=0:0:enable='between(t,${o.start.toFixed(3)},${o.end.toFixed(3)})'${label}`);
    prev = label;
  });
  return [
    ...inputs,
    '-filter_complex', chains.join(';'),
    '-map', '[vout]', '-map', '0:a',
    ...enc(quality), '-c:a', 'copy', '-movflags', '+faststart',
    outName,
  ];
}

/** Mix a music bed under the existing audio. Video stream is copied. */
export function buildMusicCommand(
  videoIn: string, musicName: string,
  opts: { startAt?: number; volume?: number; fadeOut?: number },
  totalDuration: number, outName: string, withNormalizeOpt: boolean,
): string[] {
  const vol = opts.volume ?? 0.25;
  const filters: string[] = [`volume=${vol}`];
  if (opts.fadeOut && opts.fadeOut > 0) {
    filters.push(`afade=t=out:st=${Math.max(0, totalDuration - opts.fadeOut).toFixed(3)}:d=${opts.fadeOut}`);
  }
  const amix = `amix=inputs=2:duration=first:dropout_transition=0${withNormalizeOpt ? ':normalize=0' : ''}`;
  return [
    '-i', videoIn,
    '-ss', (opts.startAt ?? 0).toFixed(3), '-i', musicName,
    '-filter_complex', `[1:a]${filters.join(',')}[m];[0:a][m]${amix}[aout]`,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    outName,
  ];
}

/** Small mono m4a for Whisper transcription (kept tiny to fit request limits). */
export function buildExtractAudioCommand(inputName: string, outName: string): string[] {
  return ['-i', inputName, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '24k', '-f', 'ipod', outName];
}
