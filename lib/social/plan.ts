// Social Studio — the EditPlan contract.
// This is the shared language between the editor agent (server, Claude) and the
// in-browser ffmpeg.wasm renderer (client). The agent emits a plan via the
// set_edit_plan tool; the renderer executes exactly what the schema allows.
// Keep schema and renderer capabilities in lockstep — the agent's system prompt
// documents THIS file.

export type Aspect = '9:16' | '1:1' | '16:9';
export type ClipFilter = 'none' | 'punch' | 'bw' | 'warm' | 'cool' | 'vhs' | 'faded';
export type TransitionType = 'cut' | 'fade';
export type CaptionPosition = 'top' | 'middle' | 'bottom';
export type CaptionSize = 'sm' | 'md' | 'lg';
export type CaptionBackground = 'none' | 'dark' | 'accent';

export interface Transition {
  type: TransitionType;
  /** seconds, 0.2–1.5; only used for 'fade' */
  duration?: number;
}

export interface PlanClip {
  /** id of an asset in the library (video or image) */
  assetId: string;
  /** trim in/out in source seconds. For images, in=0 and out=display duration. */
  in: number;
  out: number;
  /** playback speed 0.25–4 (videos only) */
  speed?: number;
  /** drop the clip's own audio */
  muted?: boolean;
  /** clip audio gain 0–2 (1 = unchanged) */
  volume?: number;
  /** color/look filter */
  filter?: ClipFilter;
  /** transition INTO the next clip (ignored on the last clip) */
  transitionAfter?: Transition;
  /** short editor label, shown on the timeline */
  label?: string;
}

export interface CaptionStyle {
  position?: CaptionPosition;   // default 'bottom'
  size?: CaptionSize;           // default 'md'
  color?: string;               // CSS color, default '#ffffff'
  background?: CaptionBackground; // default 'dark'
  accentColor?: string;         // used when background='accent', default '#2fd4e6'
  bold?: boolean;               // default true
  uppercase?: boolean;          // default false
}

export interface PlanCaption {
  text: string;
  /** seconds on the FINAL timeline (after trims/speed), not source time */
  start: number;
  end: number;
  style?: CaptionStyle;
}

export interface PlanMusic {
  assetId: string;          // an audio (or video) asset used as music bed
  /** offset into the music file, seconds */
  startAt?: number;
  /** music gain 0–2 */
  volume?: number;
  /** fade music out over the last N seconds */
  fadeOut?: number;
}

export interface EditPlan {
  version: 1;
  title?: string;
  aspect: Aspect;
  fps?: number;             // default 30
  clips: PlanClip[];
  captions?: PlanCaption[];
  music?: PlanMusic | null;
  /** agent's one-line rationale, shown in the UI */
  notes?: string;
}

// ── post copy ──────────────────────────────────────────────────
export interface PlatformPost {
  caption: string;
  hashtags: string[];   // no '#' prefix — the UI prepends it
  cta?: string;
}
export interface PostCopy {
  tiktok?: PlatformPost;
  instagram?: PlatformPost;
  youtube?: PlatformPost;
  twitter?: PlatformPost;
}
export type PostCopyPlatform = keyof PostCopy;

// ── canvas geometry ───────────────────────────────────────────
export type RenderQuality = 'draft' | 'final';

export function canvasFor(aspect: Aspect, quality: RenderQuality): { w: number; h: number } {
  const full =
    aspect === '9:16' ? { w: 1080, h: 1920 } :
    aspect === '1:1'  ? { w: 1080, h: 1080 } :
                        { w: 1920, h: 1080 };
  if (quality === 'final') return full;
  return { w: full.w / 2, h: full.h / 2 };
}

// ── duration helpers ──────────────────────────────────────────
export function clipDuration(c: PlanClip): number {
  const raw = Math.max(0, c.out - c.in);
  const speed = c.speed && c.speed > 0 ? c.speed : 1;
  return raw / speed;
}

export function planDuration(plan: EditPlan): number {
  return plan.clips.reduce((s, c) => s + clipDuration(c), 0);
}

// ── validation ────────────────────────────────────────────────
// Minimal metadata the validator needs about library assets.
export interface AssetMeta {
  id: string;
  kind: 'video' | 'image' | 'audio';
  duration?: number | null; // seconds; images/unknown → null
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  plan?: EditPlan;
}

const ASPECTS: Aspect[] = ['9:16', '1:1', '16:9'];
const FILTERS: ClipFilter[] = ['none', 'punch', 'bw', 'warm', 'cool', 'vhs', 'faded'];
const TRANSITIONS: TransitionType[] = ['cut', 'fade'];

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validate (and lightly normalize) a candidate plan against the asset library.
 * Returns errors written for the AGENT to read and self-correct.
 */
export function validatePlan(candidate: unknown, assets: AssetMeta[]): ValidationResult {
  const errors: string[] = [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const p = candidate as Partial<EditPlan> | null;

  if (!p || typeof p !== 'object') return { ok: false, errors: ['plan must be an object'] };
  if (p.version !== 1) errors.push("version must be 1");
  if (!p.aspect || !ASPECTS.includes(p.aspect)) errors.push(`aspect must be one of ${ASPECTS.join(', ')}`);
  if (p.fps !== undefined && (!num(p.fps) || p.fps < 12 || p.fps > 60)) errors.push('fps must be 12–60');

  if (!Array.isArray(p.clips) || p.clips.length === 0) {
    errors.push('clips must be a non-empty array');
  } else {
    if (p.clips.length > 40) errors.push('too many clips (max 40)');
    p.clips.forEach((c, i) => {
      const tag = `clips[${i}]`;
      if (!c || typeof c !== 'object') { errors.push(`${tag} must be an object`); return; }
      const a = byId.get(String(c.assetId));
      if (!a) { errors.push(`${tag}.assetId "${c.assetId}" is not in the library`); return; }
      if (a.kind === 'audio') errors.push(`${tag} uses audio asset "${a.id}" — audio belongs in music, not clips`);
      if (!num(c.in) || !num(c.out) || c.in < 0 || c.out <= c.in) {
        errors.push(`${tag} needs 0 <= in < out (got in=${c.in}, out=${c.out})`);
      } else {
        if (a.kind === 'video' && num(a.duration) && a.duration! > 0 && c.out > a.duration! + 0.05) {
          errors.push(`${tag}.out=${c.out}s exceeds asset duration ${a.duration!.toFixed(2)}s`);
        }
        if (c.out - c.in > 600) errors.push(`${tag} is longer than 10 minutes — trim it`);
      }
      if (c.speed !== undefined && (!num(c.speed) || c.speed < 0.25 || c.speed > 4)) {
        errors.push(`${tag}.speed must be 0.25–4`);
      }
      if (a.kind === 'image' && c.speed !== undefined && c.speed !== 1) {
        errors.push(`${tag} is an image — omit speed`);
      }
      if (c.volume !== undefined && (!num(c.volume) || c.volume < 0 || c.volume > 2)) {
        errors.push(`${tag}.volume must be 0–2`);
      }
      if (c.filter !== undefined && !FILTERS.includes(c.filter)) {
        errors.push(`${tag}.filter must be one of ${FILTERS.join(', ')}`);
      }
      if (c.transitionAfter) {
        if (!TRANSITIONS.includes(c.transitionAfter.type)) {
          errors.push(`${tag}.transitionAfter.type must be 'cut' or 'fade'`);
        }
        const d = c.transitionAfter.duration;
        if (d !== undefined && (!num(d) || d < 0.2 || d > 1.5)) {
          errors.push(`${tag}.transitionAfter.duration must be 0.2–1.5s`);
        }
      }
    });
  }

  const total = Array.isArray(p.clips)
    ? (p.clips as PlanClip[]).filter((c) => num(c?.in) && num(c?.out)).reduce((s, c) => s + clipDuration(c), 0)
    : 0;

  if (p.captions !== undefined) {
    if (!Array.isArray(p.captions)) errors.push('captions must be an array');
    else {
      if (p.captions.length > 80) errors.push('too many captions (max 80)');
      p.captions.forEach((cap, i) => {
        const tag = `captions[${i}]`;
        if (!cap || typeof cap.text !== 'string' || !cap.text.trim()) errors.push(`${tag}.text required`);
        else if (cap.text.length > 120) errors.push(`${tag}.text too long (max 120 chars — split it)`);
        if (!num(cap?.start) || !num(cap?.end) || cap.start < 0 || cap.end <= cap.start) {
          errors.push(`${tag} needs 0 <= start < end`);
        } else if (total > 0 && cap.start > total + 0.5) {
          errors.push(`${tag}.start=${cap.start}s is past the end of the ${total.toFixed(1)}s timeline`);
        }
      });
    }
  }

  if (p.music) {
    const m = p.music;
    const a = byId.get(String(m.assetId));
    if (!a) errors.push(`music.assetId "${m.assetId}" is not in the library`);
    else if (a.kind === 'image') errors.push('music.assetId must be an audio or video asset');
    if (m.startAt !== undefined && (!num(m.startAt) || m.startAt < 0)) errors.push('music.startAt must be >= 0');
    if (m.volume !== undefined && (!num(m.volume) || m.volume < 0 || m.volume > 2)) errors.push('music.volume must be 0–2');
    if (m.fadeOut !== undefined && (!num(m.fadeOut) || m.fadeOut < 0 || m.fadeOut > 10)) errors.push('music.fadeOut must be 0–10s');
  }

  if (errors.length) return { ok: false, errors };

  // Normalize: clamp end-times of captions to the timeline, default fields.
  const plan: EditPlan = {
    version: 1,
    title: p.title?.slice(0, 120),
    aspect: p.aspect as Aspect,
    fps: p.fps ?? 30,
    clips: (p.clips as PlanClip[]).map((c) => ({
      assetId: String(c.assetId),
      in: c.in, out: c.out,
      speed: c.speed, muted: c.muted, volume: c.volume,
      filter: c.filter, transitionAfter: c.transitionAfter, label: c.label?.slice(0, 60),
    })),
    captions: (p.captions ?? []).map((cap) => ({
      text: cap.text.trim(),
      start: cap.start,
      end: Math.min(cap.end, total + 0.5),
      style: cap.style,
    })),
    music: p.music ?? null,
    notes: p.notes?.slice(0, 400),
  };
  return { ok: true, errors: [], plan };
}

// Schema documentation injected into the agent's system prompt. Single source
// of truth so the agent and renderer can't drift apart silently.
export const PLAN_SCHEMA_DOC = `EditPlan JSON schema (the ONLY thing the renderer understands):
{
  "version": 1,
  "title": "optional output title",
  "aspect": "9:16" | "1:1" | "16:9",        // 9:16 for TikTok/Reels (1080x1920)
  "fps": 30,                                  // 12–60, default 30
  "clips": [                                  // played in order, max 40
    {
      "assetId": "<library asset id>",        // video or image asset
      "in": 12.5, "out": 16.0,               // trim window in SOURCE seconds (image: 0 → display seconds)
      "speed": 1,                             // 0.25–4, videos only
      "muted": false,                         // drop clip's own audio
      "volume": 1,                            // 0–2 clip audio gain
      "filter": "none|punch|bw|warm|cool|vhs|faded",
      "transitionAfter": { "type": "cut" | "fade", "duration": 0.4 },  // into NEXT clip; fade 0.2–1.5s
      "label": "hook shot"
    }
  ],
  "captions": [                               // burned-in, max 80; start/end are FINAL-timeline seconds
    {
      "text": "max ~6 words per caption",     // <=120 chars; split long lines into sequential captions
      "start": 0.0, "end": 1.6,
      "style": {
        "position": "top|middle|bottom", "size": "sm|md|lg",
        "color": "#ffffff", "background": "none|dark|accent",
        "accentColor": "#2fd4e6", "bold": true, "uppercase": false
      }
    }
  ],
  "music": {                                  // optional background music bed
    "assetId": "<audio asset id>", "startAt": 0, "volume": 0.25, "fadeOut": 2
  } | null,
  "notes": "one-line rationale for the cut"
}
Renderer capabilities & limits (do not exceed):
- Transitions: only hard cuts and fades. No slides/wipes/zooms.
- No b-roll generation, no cropping to a region, no keyframed motion. Scale+center-crop to the aspect is automatic.
- Captions are full-width centered text blocks at top/middle/bottom; word-level karaoke = many short sequential captions.
- Caption timing is on the FINAL timeline: account for trims and speed (final time = sum of previous clip durations, where each = (out-in)/speed).
- Music ducking is not dynamic: pick a music volume (≈0.15–0.35 under speech, up to 1 when no speech).`;
