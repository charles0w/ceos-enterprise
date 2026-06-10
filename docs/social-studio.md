# Social Studio (`/social`)

AI short-form video editor inside CEO OS. Drop raw content (phone footage, screen recordings, images, music), prompt the editor agent, render a production-ready MP4 **entirely in the browser**, download, post to Reels/TikTok.

## Architecture (local-first, zero new infra)

```
┌─ browser (/social) ───────────────────────────────────────────┐
│ Library: files in OPFS/IndexedDB — media NEVER uploaded       │
│ Probe: <video>/canvas → duration, dims, thumbs, frames        │
│ Render: ffmpeg.wasm (single-thread core, CDN-cached)          │
│   per-clip normalize → TS concat → caption PNG overlays →     │
│   music amix → H.264 1080x1920 (-crf 18) + faststart          │
└──────┬────────────────────────────────────────────────────────┘
       │ metadata / chat / plans only (small JSON)
┌──────▼────────────────────────────────────────────────────────┐
│ Vercel: /api/social/* (behind fleet_session middleware)       │
│   agent      → Sonnet 4.6, set_edit_plan tool (lib/social/…)  │
│   assets     → metadata registry (social_assets)              │
│   references → oEmbed enrich (social_references)              │
│   projects   → plan + chat persistence (social_projects)      │
│   transcribe → fal.ai Whisper proxy (optional FAL_KEY)        │
│   suggest    → trend research: Sonnet 4.6 + Anthropic         │
│                web_search server tool (~$0.01/search, ≤5/run) │
└───────────────────────────────────────────────────────────────┘
```

The **EditPlan** (`lib/social/plan.ts`) is the contract: the agent emits it via tool call, `validatePlan` enforces it against the library, the browser renderer executes it. Schema doc + renderer capabilities live in the same file so they can't drift.

## Env vars

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | already set | editor agent (Sonnet 4.6) |
| `POSTGRES_URL` | already set | metadata/plans/chat |
| `FAL_KEY` | optional | auto-captions via fal.ai Whisper (~$0.0005/min). Without it everything works except Transcribe. |
| `CLOUDINARY_API_SECRET` | optional | enables ☁ cloud sync + publish (signed direct browser→Cloudinary uploads). Cloud name `do0fhq9pr` + API key are defaulted in `app/api/social/cloudinary-sign/route.ts`; override with `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY`. Free plan: 25 credits/mo, 100MB max per video. |

## Workflow

1. **Drop content** into the Library pane (videos/images/audio). Files stay on-device; metadata syncs so the agent can see the library from anywhere.
2. **Transcribe** talking videos (needs `FAL_KEY`) — gives the agent timestamped speech to cut against and caption word-for-word.
3. **Add references**: paste TikTok/Reels/YouTube URLs + a note on why they work, or use *frames→chat* on a library video to let the agent see actual frames.
4. **Research the niche** (Suggestions panel) — live web search over what's getting traction in your genre → ready-to-use hooks, caption styles, hashtags (copy-all for the post), and cut techniques. Every item has **↪** to hand it to the editor; **✦ brief editor** composes a full direction from the research. Topic blank = inferred from library/plan/references.
5. **Prompt the editor** ("30s 9:16 cut, hook first, captions, music under it"). It replies + updates the Edit plan panel.
6. **Render** — draft 540p to preview fast, final 1080p to ship. Download lands as `<title>-1080x1920.mp4`, ready for IG/TikTok upload.
7. **Publish to cloud** (optional, needs `CLOUDINARY_API_SECRET`) — uploads the render to Cloudinary (`ceos-social/renders/`) and saves the link on the project. Open `/social` on your phone → grab the file → post. Per-asset **↑ cloud** likewise backs up sources (`ceos-social/library/`) so plans render on any device.

## Limits / notes

- Single-thread wasm: ~real-time-to-3x encode at 540p, slower at 1080p. Keep the tab open. Files >2GB per source may exhaust wasm memory.
- Transitions: cut + fade only (renderer-enforced; the agent knows).
- Music ducking is a static volume, not sidechain.
- Library is per-browser (local-first). "not on this device" = metadata exists but no local file and no cloud backup; assets with ☁ are fetched from Cloudinary at render time and cached locally.
- Transcription caps around ~15 min of audio per asset (request size limit).
- Logic tests: `npx tsx scripts/social-render-test.ts` (validator + ffmpeg arg builders).

## Posting (manual by design)

Auto-posting to IG/TikTok needs their official APIs (business account + app review) and is deliberately out of scope. The download → upload step keeps it ToS-clean. If that changes, the clean seam is a `POST /api/social/publish` next to `render`.
