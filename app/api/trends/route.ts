import { NextResponse } from 'next/server';
import { getEvalTrends } from '@/lib/evals';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getEvalTrends(14));
}
