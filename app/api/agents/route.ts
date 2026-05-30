import { NextResponse } from 'next/server';
import { getFleet } from '@/lib/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  const fleet = await getFleet();
  return NextResponse.json(fleet);
}
