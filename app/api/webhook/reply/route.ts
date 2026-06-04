import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { createHmac } from 'crypto';

async function notifyDiscord(biz: { name: string; owner_email: string; demo_url: string | null; outreach_body_id: string | null }) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    const tier = biz.outreach_body_id?.toUpperCase() ?? 'V1';
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `💬 Reply from ${biz.name}`,
          color: 0xa78bfa,
          fields: [
            { name: 'Email',    value: biz.owner_email,          inline: true  },
            { name: 'Sequence', value: tier,                     inline: true  },
            { name: 'Demo',     value: biz.demo_url ?? '—',      inline: false },
          ],
          footer: { text: 'berkeley-biz-websites · CEO OS' },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (e) {
    console.error('[discord]', e);
  }
}

// Resend webhook handler.
// Events handled:
//   email.received  — business replied to outreach → mark replied in DB
//   email.bounced   — our email bounced → mark bounced
//   email.delivered — confirmed delivery (informational)

function verifySignature(body: string, signature: string, secret: string): boolean {
  if (!secret) return true; // skip verification if secret not configured
  try {
    const [ts, sig] = signature.split(',').reduce(
      (acc, part) => {
        const [k, v] = part.split('=');
        if (k === 'ts') acc[0] = v;
        if (k === 'svix-signature' || k === 'v1') acc[1] = v;
        return acc;
      },
      ['', '']
    );
    const expected = createHmac('sha256', secret)
      .update(`${ts}.${body}`)
      .digest('hex');
    return expected === sig;
  } catch {
    return true; // don't block on verify errors
  }
}

async function handleEmailReceived(body: Record<string, unknown>) {
  const fromRaw = String(body.from ?? body.sender ?? '');
  const subject = String(body.subject ?? '');

  const match = fromRaw.match(/<([^>]+)>/) ?? fromRaw.match(/([^\s]+@[^\s]+)/);
  const senderEmail = (match?.[1] ?? fromRaw).toLowerCase().trim();

  if (!senderEmail || !senderEmail.includes('@')) return { matched: false };

  const { rows } = await sql`
    SELECT place_id, name, outreach_status, demo_url, outreach_body_id
    FROM businesses
    WHERE LOWER(owner_email) = ${senderEmail}
    LIMIT 1
  `;
  if (rows.length === 0) return { matched: false };

  const biz = rows[0];
  if (biz.outreach_status === 'closed') return { matched: true, skipped: 'closed' };

  await sql`
    UPDATE businesses
    SET outreach_replied_at = now(),
        outreach_status = 'replied',
        updated_at = now()
    WHERE place_id = ${biz.place_id}
      AND outreach_replied_at IS NULL
  `;

  console.log(`[webhook] reply from ${biz.name} — "${subject}"`);
  await notifyDiscord({ name: biz.name, owner_email: senderEmail, demo_url: biz.demo_url, outreach_body_id: biz.outreach_body_id });
  return { matched: true, business: biz.name };
}

async function handleEmailBounced(body: Record<string, unknown>) {
  // Outbound bounce: data.to contains the recipient email
  const data = (body.data ?? body) as Record<string, unknown>;
  const toRaw = String(data.to ?? '');
  if (!toRaw) return { matched: false };

  const { rows } = await sql`
    SELECT place_id, name FROM businesses
    WHERE LOWER(owner_email) = ${toRaw.toLowerCase()}
    LIMIT 1
  `;
  if (rows.length === 0) return { matched: false };

  await sql`
    UPDATE businesses
    SET outreach_status = 'bounced', updated_at = now()
    WHERE place_id = ${rows[0].place_id}
  `;
  console.log(`[webhook] bounce for ${rows[0].name}`);
  return { matched: true, business: rows[0].name };
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('svix-signature') ?? req.headers.get('webhook-signature') ?? '';
    const secret = process.env.RESEND_WEBHOOK_SECRET ?? '';

    if (signature && !verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ ok: false, reason: 'invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const type = String(body.type ?? body.event ?? '');

    let result: Record<string, unknown> = { matched: false };

    if (type === 'email.received' || type === 'inbound.received') {
      result = await handleEmailReceived(body.data ? (body.data as Record<string, unknown>) : body);
    } else if (type === 'email.bounced' || type === 'email.delivery_failed') {
      result = await handleEmailBounced(body);
    }
    // email.sent, email.delivered, email.opened, email.clicked — log only
    else {
      console.log(`[webhook] event: ${type}`);
    }

    return NextResponse.json({ ok: true, type, ...result });
  } catch (err) {
    console.error('[webhook] error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
