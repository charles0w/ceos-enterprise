import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { flushDigest } from '@/lib/digest';
import { notifyDiscord } from '@/lib/notify';
import { LAST_SYNC_KEY, type LastSync, contextAge, contextAgeWarning } from '@/lib/contextAge';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Daily rollup of zero-delta run briefs suppressed by /api/report (see
// lib/digest.ts). Posts one #notifs message summarizing the quiet runs and
// clears the counters; posts nothing when nothing was suppressed.
//
// Triggered by Vercel Cron (see vercel.json). When CRON_SECRET is set, Vercel
// sends it as a Bearer token; we reject anything else. Also callable manually
// (GET) for testing when no secret is configured.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const digest = await flushDigest();
    // Vault-context freshness ride-along: warn when the ai-memory mirror is
    // stale, even on days with no suppressed runs (digest === null). One
    // combined message so a quiet-but-stale day still gets exactly one post.
    const stamp = await kv.get<LastSync>(LAST_SYNC_KEY).catch(() => null);
    const warning = contextAgeWarning(contextAge(stamp?.at ?? null, Date.now()), stamp?.at ?? null);
    const msg = [digest, warning].filter(Boolean).join('\n');
    if (msg) await notifyDiscord(msg);
    return NextResponse.json({ ok: true, posted: digest != null, contextWarned: warning != null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
