import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Reliable trigger for the commerce fulfillment tick. GitHub Actions' own
// `schedule:` is best-effort — measured gaps on the */15 fulfillment cron run
// 60–140 min all day and ~200 min nightly (6–9:30 PM PT), which is what tripped
// the staleness budget. Vercel Cron fires this route every 15 min (vercel.json)
// and we workflow_dispatch the run ourselves; the workflow's `concurrency`
// group makes double-triggering (our dispatch + GitHub's own cron) harmless.
//
// Env: GH_DISPATCH_TOKEN — fine-grained PAT, repo `charles0w/shopify-arbitrage`,
// permission "Actions: write". Without it the route no-ops (GitHub's degraded
// cron remains the only trigger).
const REPO = 'charles0w/shopify-arbitrage';
const WORKFLOW = 'fulfillment.yml';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ ok: true, skipped: 'GH_DISPATCH_TOKEN not set' });

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    // GitHub returns 204 No Content on a successful dispatch.
    if (res.status !== 204) {
      const detail = await res.text();
      return NextResponse.json({ ok: false, status: res.status, detail: detail.slice(0, 300) }, { status: 502 });
    }
    return NextResponse.json({ ok: true, dispatched: `${REPO}/${WORKFLOW}` });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
