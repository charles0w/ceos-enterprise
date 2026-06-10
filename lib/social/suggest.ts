import Anthropic from '@anthropic-ai/sdk';
import type { SocialAssetRow, SocialReferenceRow } from './db';
import type { EditPlan } from './plan';

// Trend research for Social Studio. Runs Sonnet 4.6 with Anthropic's
// server-side web_search tool: it researches what's currently getting traction
// in the user's niche, then returns a structured suggestion pack (hooks,
// captions, hashtags, editing techniques) with sources. No extra API key —
// rides ANTHROPIC_API_KEY (web search is billed per search, ~$0.01/search).

const MODEL = 'claude-sonnet-4-6';
const MAX_SEARCHES = 5;

export interface SuggestFinding { title: string; url?: string; takeaway: string }
export interface SuggestSource { title: string; url: string }

export interface SuggestResult {
  topic: string;
  findings: SuggestFinding[];
  hooks: string[];
  captions: string[];
  hashtags: string[];
  editingTips: string[];
  sources: SuggestSource[];
}

const SYSTEM = `You are a short-form video strategist (TikTok / Instagram Reels / YouTube Shorts). The user is about to cut a video and wants to know what is ACTUALLY working right now in their niche before they edit.

Process:
1. Use web_search (3-5 searches) to research the niche: recent viral examples, creator breakdowns, hook formulas, format analyses, hashtag behavior. Prefer recent sources. Search variations like "<niche> tiktok viral hooks", "<niche> reels what's working <current year>", "best <niche> short-form hooks examples".
2. Synthesize for THIS user's content (you'll get their library/plan context). Be specific to the niche — no generic "post consistently" advice.
3. End your reply with ONLY a fenced \`\`\`json block:

{
  "topic": "the niche as you understood it",
  "findings": [ { "title": "pattern or example", "url": "source url if specific", "takeaway": "why it gets traction, one tight sentence" } ],   // 3-5
  "hooks": [ "ready-to-use opening lines, <=12 words, first-1.5s material" ],            // 6-8
  "captions": [ "on-video caption ideas matched to the niche's style" ],                 // 4-6
  "hashtags": [ "#mix", "#of", "#broad", "#and", "#niche" ],                             // 12-18, with #
  "editingTips": [ "concrete cut/pacing/visual techniques seen in winning videos — actionable in an editor (cuts, speed, captions style, fades)" ]  // 5-8
}

Rules: hooks must be word-for-word usable, not descriptions of hooks. editingTips must be executable with cuts/speed/captions/music (no motion graphics). Valid JSON, double quotes, no trailing commas, no commentary after the block.`;

function buildContext(opts: {
  topic?: string;
  plan: EditPlan | null;
  assets: SocialAssetRow[];
  references: SocialReferenceRow[];
}): string {
  const parts: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  parts.push(`Today's date: ${today}.`);
  if (opts.topic?.trim()) parts.push(`Stated niche/topic: ${opts.topic.trim()}`);
  if (opts.plan) {
    parts.push(`Current edit plan: "${opts.plan.title ?? 'untitled'}" · ${opts.plan.aspect} · ${opts.plan.clips.length} clips${opts.plan.notes ? ` · notes: ${opts.plan.notes}` : ''}`);
  }
  if (opts.references.length) {
    parts.push('Inspiration references the user saved:\n' + opts.references.slice(0, 8)
      .map((r) => `- ${r.title ?? r.url ?? 'note'}${r.notes ? ` — "${r.notes}"` : ''}`).join('\n'));
  }
  if (opts.assets.length) {
    parts.push('Library content:\n' + opts.assets.slice(0, 12)
      .map((a) => `- ${a.kind}: ${a.name}${a.duration ? ` (${Math.round(a.duration)}s)` : ''}`).join('\n'));
    const speech = opts.assets
      .map((a) => a.transcript?.text)
      .filter((t): t is string => !!t)
      .join(' ')
      .slice(0, 600);
    if (speech) parts.push(`What's said in the footage (excerpt): "${speech}"`);
  }
  return parts.join('\n\n');
}

function asStringArray(v: unknown, cap: number, maxLen = 200): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && !!x.trim())
    .map((x) => x.trim().slice(0, maxLen))
    .slice(0, cap);
}

function parseResult(text: string, fallbackTopic: string): Omit<SuggestResult, 'sources'> {
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const raw = fences.length ? fences[fences.length - 1][1] : null;
  if (!raw) throw new Error('research finished but returned no JSON block — try again');
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(raw); } catch { throw new Error('suggestion JSON failed to parse — try again'); }

  const findings: SuggestFinding[] = Array.isArray(obj.findings)
    ? (obj.findings as Array<Record<string, unknown>>)
        .filter((f) => f && typeof f.takeaway === 'string')
        .map((f) => ({
          title: String(f.title ?? 'pattern').slice(0, 140),
          url: typeof f.url === 'string' && /^https?:\/\//.test(f.url) ? f.url.slice(0, 400) : undefined,
          takeaway: String(f.takeaway).slice(0, 280),
        }))
        .slice(0, 6)
    : [];

  const hashtags = asStringArray(obj.hashtags, 20, 60)
    .map((h) => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, ''));

  return {
    topic: typeof obj.topic === 'string' && obj.topic.trim() ? obj.topic.trim().slice(0, 120) : fallbackTopic,
    findings,
    hooks: asStringArray(obj.hooks, 10, 140),
    captions: asStringArray(obj.captions, 8, 160),
    hashtags,
    editingTips: asStringArray(obj.editingTips, 10, 240),
  };
}

export async function runSuggestions(opts: {
  topic?: string;
  plan: EditPlan | null;
  assets: SocialAssetRow[];
  references: SocialReferenceRow[];
}): Promise<SuggestResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  }
  const context = buildContext(opts);
  if (!opts.topic?.trim() && !opts.plan && !opts.references.length && !opts.assets.length) {
    throw new Error('Give me a topic (or add content/references first) so I know what niche to research.');
  }

  const client = new Anthropic();
  // web_search is an Anthropic SERVER tool — executed by the API itself, no
  // tool-use loop needed on our side.
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES },
  ] as unknown as Anthropic.Tool[];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM,
    tools,
    messages: [{ role: 'user', content: `Research my niche and build the suggestion pack.\n\n${context}` }],
  });

  // Collect text + harvest citation sources from web-search-grounded blocks.
  let text = '';
  const sources: SuggestSource[] = [];
  const seen = new Set<string>();
  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text + '\n';
      const cits = (block as { citations?: Array<{ url?: string; title?: string }> }).citations;
      if (Array.isArray(cits)) {
        for (const c of cits) {
          if (c?.url && !seen.has(c.url)) {
            seen.add(c.url);
            sources.push({ title: (c.title || c.url).slice(0, 120), url: c.url.slice(0, 400) });
          }
        }
      }
    }
  }

  const parsed = parseResult(text, opts.topic?.trim() || 'your niche');
  return { ...parsed, sources: sources.slice(0, 8) };
}
