import { NextRequest, NextResponse } from 'next/server';
import { upsertFinanceSnapshot } from '@/lib/finance';

export const dynamic = 'force-dynamic';

// The ai-trading-bot pushes its latest snapshot here once per daily run.
// Auth: x-report-secret (same as /api/report), not a session cookie.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-report-secret');
  if (!secret || secret !== process.env.REPORT_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const cap = <T>(a: unknown, n: number): T[] => (Array.isArray(a) ? (a as T[]).slice(0, n) : []);
  await upsertFinanceSnapshot({
    model: (body.model as Record<string, unknown>) ?? null,
    scorecard: (body.scorecard as FinanceScorecardLike) ?? null,
    predictions: cap(body.predictions, 200),
    positions: cap(body.positions, 100),
    candidates: cap(body.candidates, 100),
    note: typeof body.note === 'string' ? body.note.slice(0, 300) : null,
  });

  return NextResponse.json({ ok: true });
}

// local structural type to avoid importing the full interface set here
type FinanceScorecardLike = {
  n_total: number; n_graded: number;
  hit_rate: number | null; expectancy_pct: number | null; brier: number | null;
};
