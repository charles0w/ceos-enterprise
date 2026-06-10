'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// Singleton ffmpeg.wasm instance. We use the SINGLE-THREAD core on purpose:
// the multithread build requires cross-origin isolation (COOP/COEP headers)
// which breaks other parts of the app. Slower, but zero-config and reliable.
// The ~31MB core is fetched once from the CDN and cached by the browser.

const CORE_VERSION = '0.12.10';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

// Mutable sinks so one set of listeners serves every render.
let logSink: ((line: string) => void) | null = null;
let progressSink: ((ratio: number) => void) | null = null;

export function setSinks(onLog: ((l: string) => void) | null, onProgress: ((r: number) => void) | null): void {
  logSink = onLog;
  progressSink = onProgress;
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (instance?.loaded) return instance;
  if (loading) return loading;

  loading = (async () => {
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => logSink?.(message));
    ff.on('progress', ({ progress }) => {
      const r = Number(progress);
      if (Number.isFinite(r)) progressSink?.(Math.min(1, Math.max(0, r)));
    });
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    instance = ff;
    loading = null;
    return ff;
  })();

  return loading;
}

/** exec that treats a non-zero exit code as a throw, with the last log lines attached. */
export async function execStrict(ff: FFmpeg, args: string[], logTail: string[]): Promise<void> {
  const code = await ff.exec(args);
  if (code !== 0) {
    throw new Error(`ffmpeg exited with code ${code}\n${logTail.slice(-6).join('\n')}`);
  }
}

export async function rmQuiet(ff: FFmpeg, name: string): Promise<void> {
  try { await ff.deleteFile(name); } catch { /* already gone */ }
}
