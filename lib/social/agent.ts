import Anthropic from '@anthropic-ai/sdk';
import { validatePlan, planDuration, PLAN_SCHEMA_DOC, type EditPlan, type AssetMeta, type PostCopy, type PlatformPost } from './plan';
import type { SocialAssetRow, SocialReferenceRow, Transcript } from './db';

// The Social Studio editor agent. Runs on Sonnet 4.6 (cheap + fast — the CEO
// stays on Opus). It sees the local-first library metadata, transcripts and
// inspiration references, and its ONE power is emitting a valid EditPlan via
// the set_edit_plan tool. The plan is executed by ffmpeg.wasm in the browser,
// so the schema doc below is a hard capability boundary, not a suggestion.

const MODEL = 'claude-sonnet-4-6';
const MAX_TURNS = 5;
const MAX_FRAMES = 6;

export interface SocialTrace { tool: string; input: unknown; resultPreview: string }

export interface SocialAgentResult {
  reply: string;
  plan: EditPlan | null;       // newest accepted plan this turn, if any
  postCopy: PostCopy | null;   // newest accepted post copy this turn, if any
  trace: SocialTrace[];
}

// Wire format from the client chat. Frames are small JPEG data URLs of video
// frames the user attached (e.g. from a reference clip) for vision analysis.
export interface WireMsg {
  role: 'user' | 'assistant';
  text: string;
  frames?: string[];
}

const SYSTEM = `You are the Social agent's video editor — the AI editor inside Social Studio on Charles's CEO OS dashboard. Charles drops raw content (phone footage, screen recordings, images, music) into the library and prompts you; you design the cut. Your single output mechanism is the set_edit_plan tool. The plan renders IN THE BROWSER with ffmpeg, then Charles downloads the MP4 and posts it to Instagram Reels / TikTok.

How to work:
- You see the library as metadata: id, name, kind, duration, dimensions, and (when transcribed) speech segments with timestamps. You cannot watch the videos — reason from names, durations, transcripts, the user's descriptions, and any attached frames.
- If the user attached frames (images), study them: framing, lighting, text style, energy. Use that to inform pacing, caption style and filters.
- Use transcripts hard: cut dead air, keep the strongest lines, place captions word-for-word in sync with the segment timestamps (convert source time → final-timeline time across trims/speed).
- Short-form fundamentals: hook in the first 1.5s (caption the hook), 9:16 unless told otherwise, 15–45s sweet spot, fast cuts (1.5–4s per clip), captions on for any speech, end with a payoff or CTA.
- When the brief is thin, make a strong opinionated first cut rather than interrogating the user — then ask AT MOST one sharp follow-up.
- Every time the cut should change, call set_edit_plan with the COMPLETE new plan (it replaces the old one wholesale). If validation fails, fix the errors and call it again.
- After a plan is accepted, reply with a tight summary: total duration, structure (hook → body → payoff), what you'd improve next. No fluff.
- Caption timing math must be exact: final time of a source moment t in clip k = sum of durations of clips 0..k-1 + (t - clip_k.in) / clip_k.speed.
- You cannot: generate footage, see un-attached video content, post to platforms, or use transitions beyond cut/fade. Say so plainly if asked.

${PLAN_SCHEMA_DOC}

## POST COPY PACKAGING

After set_edit_plan is accepted on a first cut or a significant content change, call set_post_copy proactively. Include only platforms that match the aspect ratio and content type — omit platforms that don't fit.

Aspect-to-platform mapping:
- 9:16 (vertical short-form) → tiktok + instagram; youtube optional
- 1:1 (square) → instagram + twitter
- 16:9 (landscape) → youtube; twitter optional

Platform rules (write copy that earns the click on each platform):
- tiktok: caption ≤150 chars ideal (hard max 2200), gen-Z conversational tone, hook as the very first sentence, 5–10 hashtags (no # prefix), optional CTA
- instagram: hook on first line (only ~125 chars show before "more" — it must work standalone), aesthetic tone, 10–20 hashtags, CTA drives follow or "link in bio"
- youtube: first line IS the video title (≤100 chars, title-case, curiosity-gap or benefit-driven), 3–5 hashtags, CTA drives subscribe or watch-next
- twitter: caption + space + hashtags + space + CTA ≤280 chars total; 1–3 hashtags; punchy and direct

Do NOT call set_post_copy for minor plan tweaks (adjusting a single clip's in/out, fixing a caption typo, changing speed). Call it when: (1) the first complete plan is accepted, (2) the user asks for captions/hashtags/post copy, or (3) the content title or concept changes significantly. If the user asks to refine copy, call set_post_copy again with the revised text.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'set_edit_plan',
    description:
      'Replace the current edit plan with a complete new EditPlan (see schema in your instructions). Validated against the library; on failure you get the exact errors back — fix and retry.',
    input_schema: {
      type: 'object',
      properties: {
        plan: { type: 'object', description: 'The complete EditPlan JSON object' },
      },
      required: ['plan'],
    },
  },
  {
    name: 'set_post_copy',
    description:
      'Package platform-specific post copy for the current edit. Call proactively after set_edit_plan succeeds on a first/major cut, or when the user asks for captions or hashtags. Include only platforms that match the aspect ratio — omit platforms that don\'t fit (e.g. skip tiktok for 16:9 content).',
    input_schema: {
      type: 'object',
      properties: {
        tiktok: {
          type: 'object',
          description: '9:16 content. Caption ≤150 chars ideal, gen-Z tone, hook first. 5–10 hashtags (no # prefix). CTA optional.',
          properties: {
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            cta: { type: 'string' },
          },
          required: ['caption', 'hashtags'],
        },
        instagram: {
          type: 'object',
          description: 'Hook on first line (≤125 chars shown before "more"). Aesthetic tone. 10–20 hashtags. CTA.',
          properties: {
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            cta: { type: 'string' },
          },
          required: ['caption', 'hashtags'],
        },
        youtube: {
          type: 'object',
          description: 'First line is the video title (≤100 chars, title-case, click-worthy). 3–5 hashtags. CTA drives subscribe.',
          properties: {
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            cta: { type: 'string' },
          },
          required: ['caption', 'hashtags'],
        },
        twitter: {
          type: 'object',
          description: 'Entire post (caption + hashtags + CTA) ≤280 chars total. 1–3 hashtags. Punchy and direct.',
          properties: {
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            cta: { type: 'string' },
          },
          required: ['caption', 'hashtags'],
        },
      },
    },
  },
  {
    name: 'get_transcript',
    description:
      'Fetch the FULL timestamped transcript segments for a library asset (the library listing only previews them). Use before doing caption work on a long video.',
    input_schema: {
      type: 'object',
      properties: { assetId: { type: 'string' } },
      required: ['assetId'],
    },
  },
];

function transcriptPreview(t: Transcript | null): string {
  if (!t || !t.text) return 'none';
  const segs = t.segments.slice(0, 12)
    .map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`)
    .join(' | ');
  const more = t.segments.length > 12 ? ` …(+${t.segments.length - 12} more segments — use get_transcript)` : '';
  return `${segs}${more}`;
}

function libraryContext(assets: SocialAssetRow[], references: SocialReferenceRow[], currentPlan: EditPlan | null, currentPostCopy: PostCopy | null): string {
  const lib = assets.length
    ? assets.map((a) =>
        `- id=${a.id} · ${a.kind} · "${a.name}"` +
        (a.duration ? ` · ${a.duration.toFixed(1)}s` : '') +
        (a.width && a.height ? ` · ${a.width}x${a.height}` : '') +
        (a.notes ? ` · notes: ${a.notes.slice(0, 140)}` : '') +
        `\n  speech: ${transcriptPreview(a.transcript)}`,
      ).join('\n')
    : '(library is empty — tell the user to drag content into the Library pane first)';

  const refs = references.length
    ? references.map((r) =>
        `- ${r.title ?? r.url ?? 'untitled'}${r.author ? ` by ${r.author}` : ''}${r.provider ? ` (${r.provider})` : ''}${r.notes ? ` — user notes: ${r.notes.slice(0, 200)}` : ''}`,
      ).join('\n')
    : '(none yet)';

  return `## LIBRARY (asset ids are the only valid clip sources)\n${lib}\n\n## INSPIRATION REFERENCES\n${refs}\n\n## CURRENT PLAN\n${currentPlan ? JSON.stringify(currentPlan) : '(none — you are making the first cut)'}\n\n## CURRENT POST COPY\n${currentPostCopy ? JSON.stringify(currentPostCopy) : '(none — call set_post_copy after the plan is set)'}`;
}

function dataUrlToImageBlock(dataUrl: string): Anthropic.ImageBlockParam | null {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return {
    type: 'image',
    source: { type: 'base64', media_type: m[1] as 'image/jpeg', data: m[2] },
  };
}

function toAnthropicMessages(messages: WireMsg[]): Anthropic.MessageParam[] {
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
  return messages.map((m, i) => {
    // Only ship frames on the latest user turn — history keeps a text marker.
    if (m.role === 'user' && m.frames?.length) {
      if (i === lastUserIdx) {
        const imgs = m.frames.slice(0, MAX_FRAMES)
          .map(dataUrlToImageBlock)
          .filter((b): b is Anthropic.ImageBlockParam => b !== null);
        return {
          role: 'user' as const,
          content: [...imgs, { type: 'text' as const, text: m.text || '(see attached frames)' }],
        };
      }
      return { role: m.role, content: `${m.text}\n[${m.frames.length} frame(s) were attached here]` };
    }
    return { role: m.role, content: m.text || '…' };
  });
}

export async function runSocialAgent(opts: {
  messages: WireMsg[];
  assets: SocialAssetRow[];
  references: SocialReferenceRow[];
  currentPlan: EditPlan | null;
  currentPostCopy: PostCopy | null;
}): Promise<SocialAgentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  }
  const client = new Anthropic();
  const trace: SocialTrace[] = [];
  let acceptedPlan: EditPlan | null = null;
  let acceptedPostCopy: PostCopy | null = null;

  const assetMeta: AssetMeta[] = opts.assets.map((a) => ({ id: a.id, kind: a.kind, duration: a.duration }));
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: SYSTEM },
    { type: 'text', text: libraryContext(opts.assets, opts.references, opts.currentPlan, opts.currentPostCopy) },
  ];
  const convo: Anthropic.MessageParam[] = toAnthropicMessages(opts.messages);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 9000,
      system,
      tools: TOOLS,
      messages: convo,
    });

    convo.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return { reply: reply || '(no text reply)', plan: acceptedPlan, postCopy: acceptedPostCopy, trace };
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let out: string;
      try {
        if (tu.name === 'set_edit_plan') {
          const input = (tu.input ?? {}) as { plan?: unknown };
          const v = validatePlan(input.plan, assetMeta);
          if (v.ok && v.plan) {
            acceptedPlan = v.plan;
            out = `Plan accepted: ${v.plan.clips.length} clips, ${(v.plan.captions ?? []).length} captions, ${planDuration(v.plan).toFixed(1)}s total at ${v.plan.aspect}.`;
          } else {
            out = `Plan REJECTED — fix these and call set_edit_plan again:\n- ${v.errors.join('\n- ')}`;
          }
        } else if (tu.name === 'set_post_copy') {
          const input = (tu.input ?? {}) as Partial<Record<keyof PostCopy, Partial<PlatformPost>>>;
          const platforms = (['tiktok', 'instagram', 'youtube', 'twitter'] as const).filter((p) => input[p]);
          if (platforms.length === 0) {
            out = 'set_post_copy called with no platforms — include at least one of: tiktok, instagram, youtube, twitter.';
          } else {
            const copy: PostCopy = {};
            for (const p of platforms) {
              const pp = input[p];
              if (pp && typeof pp.caption === 'string' && Array.isArray(pp.hashtags)) {
                copy[p] = {
                  caption: pp.caption.slice(0, 2200),
                  hashtags: (pp.hashtags as unknown[]).slice(0, 30).map((h) => String(h).replace(/^#/, '')),
                  ...(pp.cta ? { cta: String(pp.cta).slice(0, 140) } : {}),
                };
              }
            }
            acceptedPostCopy = copy;
            out = `Post copy set for: ${Object.keys(copy).join(', ')}.`;
          }
        } else if (tu.name === 'get_transcript') {
          const id = String((tu.input as { assetId?: string })?.assetId ?? '');
          const asset = opts.assets.find((a) => a.id === id);
          if (!asset) out = `No asset with id ${id}.`;
          else if (!asset.transcript?.segments?.length) out = `Asset ${id} has no transcript. Ask the user to hit Transcribe on it in the Library pane.`;
          else {
            out = asset.transcript.segments
              .map((s) => `[${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text}`)
              .join('\n')
              .slice(0, 14_000);
          }
        } else {
          out = `Unknown tool: ${tu.name}`;
        }
      } catch (err) {
        out = `Tool error: ${String(err)}`;
      }
      trace.push({ tool: tu.name, input: tu.name === 'set_edit_plan' ? '(plan json)' : tu.input, resultPreview: out.slice(0, 200) });
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    convo.push({ role: 'user', content: results });
  }

  return {
    reply: acceptedPlan
      ? 'Plan updated (hit the tool-iteration limit while refining — ask me to continue if something looks off).'
      : 'I hit the tool-iteration limit before landing a valid plan. Ask me to continue.',
    plan: acceptedPlan,
    postCopy: acceptedPostCopy,
    trace,
  };
}
