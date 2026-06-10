import { NextRequest, NextResponse } from 'next/server';
import { listReferences, upsertReference, deleteReference } from '@/lib/social/db';

export const dynamic = 'force-dynamic';

// Inspiration references: a TikTok/Reels/YouTube URL plus the user's notes on
// WHY it works. We enrich with public oEmbed metadata where available
// (best-effort, 5s timeout) so the agent gets title/author context.

interface OEmbed { title?: string; author_name?: string; thumbnail_url?: string }

async function fetchOEmbed(url: string): Promise<{ provider: string; data: OEmbed | null }> {
  let endpoint: string | null = null;
  let provider = 'link';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.endsWith('tiktok.com')) {
      provider = 'tiktok';
      endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    } else if (host.endsWith('youtube.com') || host === 'youtu.be') {
      provider = 'youtube';
      endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    } else if (host.endsWith('instagram.com')) {
      provider = 'instagram'; // no public oEmbed without an app token — store as-is
    }
  } catch { /* not a URL */ }

  if (!endpoint) return { provider, data: null };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(endpoint, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return { provider, data: null };
    return { provider, data: (await res.json()) as OEmbed };
  } catch {
    return { provider, data: null };
  }
}

export async function GET() {
  try {
    return NextResponse.json({ references: await listReferences() });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { id?: string; url?: string; notes?: string; title?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const id = body.id || `ref_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const url = body.url?.trim() || null;
  if (!url && !body.notes?.trim()) {
    return NextResponse.json({ error: 'url or notes required' }, { status: 400 });
  }

  let provider: string | null = null;
  let title = body.title?.trim() || null;
  let author: string | null = null;
  let thumbUrl: string | null = null;

  if (url) {
    const { provider: prov, data } = await fetchOEmbed(url);
    provider = prov;
    title = title || data?.title?.slice(0, 200) || null;
    author = data?.author_name?.slice(0, 120) || null;
    thumbUrl = data?.thumbnail_url || null;
  }

  try {
    await upsertReference({
      id, url, title, author, provider, thumbUrl,
      notes: body.notes?.slice(0, 2000) ?? null,
    });
    return NextResponse.json({ ok: true, id, title, author, provider, thumbUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    await deleteReference(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
