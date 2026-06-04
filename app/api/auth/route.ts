import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password, next } = await req.json();
  const expected = process.env.FLEET_PASSWORD ?? '';

  if (!expected || password !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, next: next || '/' });
  res.cookies.set('fleet_session', expected, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return res;
}
