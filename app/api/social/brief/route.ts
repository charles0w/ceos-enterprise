import { NextResponse } from 'next/server';
import { getLatestBrief, runWeeklyBrief } from '@/lib/social/trendBrief';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // generation does live web research (~30-60s)

// The Studio's trend-desk brief. Session-gated by middleware.
export async function GET() {
  const brief = await getLatestBrief();
  return NextResponse.json({ brief });
}

// Generate now (the panel's manual trigger; the Sunday cron is the usual path).
export async function POST() {
  try {
    const brief = await runWeeklyBrief();
    return NextResponse.json({ brief });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
