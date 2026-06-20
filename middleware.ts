import { NextRequest, NextResponse } from 'next/server';

// Public routes — no auth required (portfolio, demo sites, webhooks)
const PUBLIC_PREFIXES = [
  '/portfolio',
  '/demo',         // public, read-only showcase (mock data, scripted CEO chat)
  '/login',
  '/api/webhook',
  '/api/auth',
  '/api/report',   // agents authenticate with x-report-secret, not a session cookie
  '/api/finance',  // ai-trading-bot pushes its snapshot with x-report-secret
  '/api/tasks',    // dual-auth inside the route: session cookie (dashboard) or x-report-secret (agents)
  '/api/memory',     // ai-memory vault<->DB sync authenticates with x-report-secret
  '/api/brain/sync', // push skills to vault — write-only, no sensitive data exposed
  '/api/cron',       // Vercel Cron authenticates with CRON_SECRET, not a session cookie
  '/_next',
  '/favicon',
  '/icon',      // app icon (also used on the public login screen)
  '/apple-icon',
  '/manifest',  // home-screen install manifest
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
