import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

// Resend inbound email webhook.
// When a business replies to an outreach email, Resend POSTs here.
// We match by the sender's email address → update outreach_replied_at in Neon.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Resend inbound payload: { from, to, subject, text, html, ... }
    const fromRaw: string = body.from ?? '';
    const subject: string = body.subject ?? '';

    // Extract email address from "Name <email>" or bare "email"
    const match = fromRaw.match(/<([^>]+)>/) ?? fromRaw.match(/([^\s]+@[^\s]+)/);
    const senderEmail = (match?.[1] ?? fromRaw).toLowerCase().trim();

    if (!senderEmail || !senderEmail.includes('@')) {
      return NextResponse.json({ ok: false, reason: 'no valid sender email' }, { status: 400 });
    }

    // Find the business that was sent outreach to this email address
    const { rows } = await sql`
      SELECT place_id, name, outreach_status
      FROM businesses
      WHERE LOWER(owner_email) = ${senderEmail}
      LIMIT 1
    `;

    if (rows.length === 0) {
      // Not a business we emailed — could be spam, ignore
      return NextResponse.json({ ok: true, matched: false });
    }

    const biz = rows[0];

    // Only update if not already marked as replied/closed
    if (biz.outreach_status === 'closed') {
      return NextResponse.json({ ok: true, matched: true, skipped: 'already closed' });
    }

    await sql`
      UPDATE businesses
      SET
        outreach_replied_at = now(),
        outreach_status = 'replied',
        updated_at = now()
      WHERE place_id = ${biz.place_id}
        AND outreach_replied_at IS NULL
    `;

    console.log(`[reply-webhook] ${biz.name} replied — subject: "${subject}"`);

    return NextResponse.json({ ok: true, matched: true, business: biz.name });
  } catch (err) {
    console.error('[reply-webhook] error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
