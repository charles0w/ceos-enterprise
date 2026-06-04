import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

// Outcomes: interested | voicemail | not_interested | skip | closed
export async function POST(req: NextRequest) {
  try {
    const { place_id, outcome, notes } = await req.json();
    if (!place_id || !outcome) {
      return NextResponse.json({ ok: false, error: 'missing place_id or outcome' }, { status: 400 });
    }

    if (outcome === 'skip') {
      return NextResponse.json({ ok: true });
    }

    const statusMap: Record<string, string> = {
      interested:     'phone_interested',
      voicemail:      'voicemail',
      not_interested: 'not_interested',
      closed:         'closed',
    };

    const newStatus = statusMap[outcome] ?? outcome;

    await sql`
      UPDATE businesses
      SET
        outreach_status   = ${newStatus},
        outreach_channel  = 'phone',
        outreach_sent_at  = COALESCE(outreach_sent_at, now()),
        notes             = CASE WHEN ${notes ?? ''} <> '' THEN ${notes ?? ''} ELSE notes END,
        updated_at        = now()
      WHERE place_id = ${place_id}
    `;

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
