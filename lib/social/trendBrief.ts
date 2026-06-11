import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';
import { upsertStatus } from '../registry';

// ── The Brief — instagram-trend-desk, Phase 0.5 ───────────────
// Sunday-morning 5-bullet trend brief for @ceo.0uch, generated with
// Sonnet + server-side web search over the UPSTREAM sources (Substacks,
// Reddit) where signal incubates weeks before it hits IG. The editorial
// rubric below is distilled from instagram-trend-desk/docs/AESTHETIC-RULES.md
// and WATCHLIST.md — that repo stays the canonical spec; update both
// together. No scraping infra by design: this exists to finally run the
// Phase 0 gate ("does a brief change what gets shot?") at ~$0.05/brief.
// The Apify watchlist pipeline (Phase 1) is earned only if engagement moves.

const MODEL = 'claude-sonnet-4-6';
const MAX_SEARCHES = 6;

export type BulletKind = 'heating' | 'steal' | 'cooling' | 'hook' | 'mover';

export interface BriefBullet {
  kind: BulletKind;
  title: string;   // short headline, lowercase deadpan ok
  body: string;    // 1-3 tight sentences, specific and actionable
}

export interface TrendBrief {
  briefDate: string;            // YYYY-MM-DD
  bullets: BriefBullet[];
  sources: { title: string; url: string }[];
  createdAt?: string;
}

export const BULLET_LABELS: Record<BulletKind, string> = {
  heating: 'heating up',
  steal: 'steal this look',
  cooling: 'cooling',
  hook: 'post hook',
  mover: 'watchlist mover',
};

const SYSTEM = `You are the trend desk for @ceo.0uch — a single-creator Instagram account in the Soft Tech / Ivy Gorp aesthetic (Aimé Leon Dore / KITH / Stüssy / Our Legacy / Salomon / New Balance / Beams / A.P.C. axis). The creator's POV is "lifts and reads": visible athletic build + deadpan literary tone, ALWAYS implicit, never explicit.

Your job: a Sunday 5-bullet brief that changes what gets shot this week. The product is the brief — specific, opinionated, scored against the rubric below. Generic growth advice is a failure.

PROCESS — use web_search (4-6 searches) over the UPSTREAM sources where this aesthetic incubates before hitting Instagram:
- Blackbird Spyplane (Jonah Weiner's Substack — calls moves 3-6 months early), Throwing Fits (Lawrence Schlossman / James Harris), Magasin (Hanna Lee), Die Workwear
- r/streetwear and r/malefashion top posts this week, r/grailed (what sells fast = revealed preference)
- Recent coverage of: Aimé Leon Dore, Teddy Santis, Our Legacy, Beams Plus, Stüssy, Salomon XT-6, New Balance 990/1906/2002R, Carhartt WIP, Auralee, Lemaire, Drake's, Noah NYC
Search recent material (this month). Prefer what tastemakers are SAYING over listicles.

THE RUBRIC (every bullet must pass):
- On-aesthetic: brand whitelist above. Blacklist: Supreme post-2022, Bape/Off-White/Fear-of-God-Essentials (streetwear-bro), Gymshark/YoungLA (gym-bro), Gucci/LV luxury-flex. Positive silhouettes: boxy crewnecks, baggy straight + cropped pant, henley with tank visible, knit polo, Salomon/NB low-tops, chore coats. Negative: skinny jeans, high-tops, logo-on-chest, drop-shoulder oversized on a built frame (reads costume). Palette: cream/ecru/stone/oat/olive/navy/brown/rust/faded indigo. Never: neons, black-on-black, pastels other than cream.
- On-build: the creator is visibly athletic — the rare edge in this tribe. Favor looks the build flatters: henley + tank (shoulder seam pull is THE move), knit polo, slim crewneck, tee + open shirt, forearm visible (sleeve pushed, coffee, gym-bag strap). Avoid: fully-buttoned boxy layers that drown the frame, skinny-top/baggy-bottom proportions.
- Subtle flex semiotics: context over object (the apartment, the bookshelf, the location — never the brand callout). No face / face turned away. Deadpan lowercase captions — a time, a place, a single word, an obscure but correct reference. NEVER: exclamation marks, hashtag walls, "love this fit 🔥", outfit-breakdown captions, quoting Camus (lifts-and-reads is implicit or it's cosplay).

OUTPUT — end your reply with ONLY a fenced \`\`\`json block:
{
  "bullets": [
    { "kind": "heating", "title": "...", "body": "one fit/aesthetic move clearly recurring upstream right now, and why it fits the tribe" },
    { "kind": "steal",   "title": "...", "body": "ONE specific shot for this week: pieces (generic: 'knit polo', 'cream henley'), setting, framing, light. Shootable in 20 minutes at home. Must flatter an athletic frame." },
    { "kind": "cooling", "title": "...", "body": "one saturated thing to skip, and the tell" },
    { "kind": "hook",    "title": "...", "body": "one caption/framing pattern in the deadpan-lowercase voice — give the actual caption text" },
    { "kind": "mover",   "title": "...", "body": "one creator/account/name gaining ground in this lane per upstream discourse — note web search can't see IG numbers; cite where the signal came from" }
  ],
  "sources": [ { "title": "...", "url": "..." } ]   // 3-6, the searches that actually informed the brief
}
Exactly these 5 kinds, in this order. Valid JSON, double quotes, no trailing commas, no commentary after the block.`;

async function ensureTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS social_briefs (
      id          BIGSERIAL PRIMARY KEY,
      brief_date  DATE NOT NULL UNIQUE,
      bullets     JSONB NOT NULL,
      sources     JSONB NOT NULL DEFAULT '[]',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

const KINDS: BulletKind[] = ['heating', 'steal', 'cooling', 'hook', 'mover'];

function parseBrief(text: string, briefDate: string): TrendBrief {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error('brief generation returned no JSON block');
  const raw = JSON.parse(m[1]) as { bullets?: unknown; sources?: unknown };
  const bullets = (Array.isArray(raw.bullets) ? raw.bullets : [])
    .filter((b): b is BriefBullet =>
      b != null && typeof (b as BriefBullet).title === 'string' && typeof (b as BriefBullet).body === 'string'
      && KINDS.includes((b as BriefBullet).kind))
    .map((b) => ({ kind: b.kind, title: b.title.slice(0, 120), body: b.body.slice(0, 600) }));
  if (bullets.length < 5) throw new Error(`brief has ${bullets.length}/5 valid bullets`);
  const sources = (Array.isArray(raw.sources) ? raw.sources : [])
    .filter((s): s is { title: string; url: string } =>
      s != null && typeof (s as { title?: unknown }).title === 'string' && typeof (s as { url?: unknown }).url === 'string')
    .slice(0, 6);
  return { briefDate, bullets: bullets.slice(0, 5), sources };
}

// Generate this week's brief with live web research. ~30-60s.
export async function generateBrief(briefDate?: string): Promise<TrendBrief> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const date = briefDate ?? new Date().toISOString().slice(0, 10);
  const client = new Anthropic();
  // web_search is an Anthropic SERVER tool — executed by the API itself
  // (same cast pattern as lib/social/suggest.ts).
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES },
  ] as unknown as Anthropic.Tool[];
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    tools,
    messages: [{
      role: 'user',
      content: `Write the brief for Sunday ${date}. Research first, then the 5 bullets. Remember: the steal-this-look must be shootable this week with common Soft Tech pieces, and every bullet passes the rubric.`,
    }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return parseBrief(text, date);
}

export async function saveBrief(brief: TrendBrief): Promise<void> {
  await ensureTable();
  await sql`
    INSERT INTO social_briefs (brief_date, bullets, sources)
    VALUES (${brief.briefDate}, ${JSON.stringify(brief.bullets)}, ${JSON.stringify(brief.sources)})
    ON CONFLICT (brief_date) DO UPDATE SET
      bullets = EXCLUDED.bullets,
      sources = EXCLUDED.sources,
      created_at = now()
  `;
}

export async function getLatestBrief(): Promise<TrendBrief | null> {
  try {
    await ensureTable();
    const { rows } = await sql`
      SELECT brief_date, bullets, sources, created_at
      FROM social_briefs ORDER BY brief_date DESC LIMIT 1
    `;
    if (!rows.length) return null;
    const r = rows[0];
    return {
      briefDate: new Date(r.brief_date).toISOString().slice(0, 10),
      bullets: r.bullets,
      sources: r.sources ?? [],
      createdAt: r.created_at,
    };
  } catch {
    return null;
  }
}

export async function countBriefs(): Promise<number> {
  try {
    await ensureTable();
    const { rows } = await sql`SELECT COUNT(*) AS n FROM social_briefs`;
    return Number(rows[0].n);
  } catch {
    return 0;
  }
}

// Generate → save → deliver → report. The one entry point the cron and the
// Studio's generate-now button share. Reporting as `social` is what finally
// lights that card up — keep the summary honest about what actually ran.
export async function runWeeklyBrief(): Promise<TrendBrief> {
  const brief = await generateBrief();
  await saveBrief(brief);
  const discord = await deliverToDiscord(brief);
  const briefs = await countBriefs();
  const heating = brief.bullets.find((b) => b.kind === 'heating');
  await upsertStatus('social', {
    state: 'ok',
    lastRun: new Date().toISOString(),
    summary: `trend brief · ${brief.briefDate} — ${heating?.title ?? '5 bullets'}${discord ? ' · → discord' : ''}`,
    ok: true,
    metrics: [
      { label: 'Briefs', value: briefs },
      { label: 'Bullets', value: brief.bullets.length },
      { label: 'Sources', value: brief.sources.length },
    ],
  }).catch(() => { /* reporting is best-effort; the brief itself is saved */ });
  return brief;
}

// Optional Discord delivery — the trend-desk plan's original channel.
// Fires only when DISCORD_BRIEF_WEBHOOK is configured; never throws.
export async function deliverToDiscord(brief: TrendBrief): Promise<boolean> {
  const url = process.env.DISCORD_BRIEF_WEBHOOK;
  if (!url) return false;
  const lines = brief.bullets.map(
    (b) => `**${BULLET_LABELS[b.kind]}** — ${b.title}\n${b.body}`
  );
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: `**the brief · ${brief.briefDate}**\n\n${lines.join('\n\n')}`.slice(0, 1990),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
