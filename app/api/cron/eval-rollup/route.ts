import { NextRequest, NextResponse } from 'next/server';
import { rollupDaily } from '@/lib/evals';

export const dynamic = 'force-dynamic';

// Triggered by Vercel Cron (see vercel.json). When CRON_SECRET is set, Vercel
// sends it as a Bearer token; we reject anything else. Also callable manually
// (GET) for testing when no secret is configured.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await rollupDaily());
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
