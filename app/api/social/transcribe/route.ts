import { NextRequest, NextResponse } from 'next/server';
import { setAssetTranscript, type Transcript } from '@/lib/social/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Whisper transcription proxy (fal.ai). Optional: everything else in the
// studio works without FAL_KEY — this powers word-synced auto-captions.
// The client extracts a small mono 24kbps MP3 with ffmpeg.wasm and sends it
// as a data URI (fal accepts data URIs as audio_url). Keep audio <= ~15 min
// so the request stays under Vercel's body limit.

interface FalChunk { timestamp: [number, number]; text: string }
interface FalWhisperOut { text?: string; chunks?: FalChunk[]; inferred_languages?: string[] }

export async function POST(req: NextRequest) {
  const key = process.env.FAL_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'FAL_KEY is not set — add it in Vercel env vars to enable auto-captions (fal.ai → Keys).' },
      { status: 501 },
    );
  }

  let body: { assetId?: string; audioDataUri?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const { assetId, audioDataUri } = body;
  if (!assetId || !audioDataUri?.startsWith('data:audio/')) {
    return NextResponse.json({ error: 'assetId and audioDataUri (data:audio/...) required' }, { status: 400 });
  }
  if (audioDataUri.length > 4_200_000) {
    return NextResponse.json({ error: 'audio too large — transcription is capped at ~15 minutes' }, { status: 413 });
  }

  try {
    const res = await fetch('https://fal.run/fal-ai/whisper', {
      method: 'POST',
      headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ audio_url: audioDataUri, task: 'transcribe', chunk_level: 'segment' }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json({ error: `fal.ai whisper failed (${res.status}): ${detail}` }, { status: 502 });
    }
    const out = (await res.json()) as FalWhisperOut;

    const transcript: Transcript = {
      text: (out.text ?? '').trim(),
      segments: (out.chunks ?? [])
        .filter((c) => Array.isArray(c.timestamp) && typeof c.text === 'string')
        .map((c) => ({
          start: Number(c.timestamp[0] ?? 0),
          end: Number(c.timestamp[1] ?? 0),
          text: c.text.trim(),
        })),
      language: out.inferred_languages?.[0],
      source: 'fal-whisper',
    };

    await setAssetTranscript(assetId, transcript);
    return NextResponse.json({ ok: true, transcript });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
