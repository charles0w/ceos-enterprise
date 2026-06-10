import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

// Signs direct browser→Cloudinary uploads so media bytes never pass through
// Vercel (4.5MB body limit). The browser uploads straight to
// api.cloudinary.com with this signature. Behind the fleet_session gate.
//
// Cloud name + API key are public-ish identifiers; only CLOUDINARY_API_SECRET
// is sensitive and must be set in env (Cloudinary console → API Keys).

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'do0fhq9pr';
const API_KEY = process.env.CLOUDINARY_API_KEY || '329431293862667';

export async function POST(req: NextRequest) {
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CLOUDINARY_API_SECRET is not set — add it in Vercel env (Cloudinary console → Settings → API Keys) to enable cloud sync.' },
      { status: 501 },
    );
  }

  let body: { folder?: string; publicId?: string };
  try { body = await req.json(); } catch { body = {}; }

  const folder = (body.folder || 'ceos-social').replace(/[^\w/-]/g, '').slice(0, 80);
  const publicId = body.publicId ? body.publicId.replace(/[^\w-]/g, '').slice(0, 100) : undefined;
  const timestamp = Math.floor(Date.now() / 1000);

  // Signature: sorted params as key=value joined by '&', then append secret, SHA-1 hex.
  const params: Record<string, string | number> = { folder, timestamp };
  if (publicId) params.public_id = publicId;
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  const signature = createHash('sha1').update(toSign + secret).digest('hex');

  return NextResponse.json({
    cloudName: CLOUD_NAME,
    apiKey: API_KEY,
    timestamp,
    folder,
    publicId: publicId ?? null,
    signature,
  });
}
