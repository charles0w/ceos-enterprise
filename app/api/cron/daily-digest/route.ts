import { NextRequest, NextResponse } from 'next/server';
import { flushDigest } from '@/lib/digest';
import { notifyDiscord } from '@/lib/notify';

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
    if (digest) await notifyDiscord(digest);
    return NextResponse.json({ ok: true, posted: digest != null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
