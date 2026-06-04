import { NextRequest, NextResponse } from 'next/server';

// Public routes — no auth required (portfolio, demo sites, webhooks)
const PUBLIC_PREFIXES = [
  '/portfolio',
  '/login',
  '/api/webhook',
  '/api/auth',
  '/_next',
  '/favicon',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = req.cookies.get('fleet_session')?.value;
  const expected = process.env.FLEET_PASSWORD ?? '';

  if (expected && session === expected) {
    return NextResponse.next();
  }

  // Redirect to login, preserving intended destination
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
