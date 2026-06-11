import { NextRequest, NextResponse } from 'next/server';
import { runWeeklyBrief } from '@/lib/social/trendBrief';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Sunday-morning trend brief (see vercel.json crons — 16:00 UTC ≈ 9am PT).
// Same auth pattern as eval-rollup: Vercel Cron sends CRON_SECRET as a
// Bearer token; reject anything else when the secret is configured.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const brief = await runWeeklyBrief();
    return NextResponse.json({ ok: true, briefDate: brief.briefDate, bullets: brief.bullets.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
