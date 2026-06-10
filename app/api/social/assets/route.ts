import { NextRequest, NextResponse } from 'next/server';
import { listAssets, upsertAsset, deleteAsset } from '@/lib/social/db';

export const dynamic = 'force-dynamic';

// Metadata-only asset registry. The actual media bytes never hit this server —
// they live in the browser's OPFS (local-first). Protected by the fleet_session
// gate in middleware.ts.

export async function GET() {
  try {
    return NextResponse.json({ assets: await listAssets() });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const { id, name, kind } = body as { id?: string; name?: string; kind?: string };
  if (!id || !name || !kind || !['video', 'image', 'audio'].includes(kind)) {
    return NextResponse.json({ error: 'id, name and kind (video|image|audio) required' }, { status: 400 });
  }
  const thumb = typeof body.thumb === 'string' && body.thumb.length <= 24_000 ? body.thumb : null;

  try {
    await upsertAsset({
      id, name: String(name).slice(0, 200), kind,
      mime: typeof body.mime === 'string' ? body.mime : null,
      sizeBytes: typeof body.sizeBytes === 'number' ? Math.round(body.sizeBytes) : null,
      duration: typeof body.duration === 'number' ? body.duration : null,
      width: typeof body.width === 'number' ? Math.round(body.width) : null,
      height: typeof body.height === 'number' ? Math.round(body.height) : null,
      thumb,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null,
      cloudUrl: typeof body.cloudUrl === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(body.cloudUrl)
        ? body.cloudUrl.slice(0, 500) : null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    await deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
