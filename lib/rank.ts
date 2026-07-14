import type { MemoryNote } from './aiMemory';

// Server-side port of ai-memory/scripts/recall.mjs ranking, so /api/context ranks
// context the same way a local Claude Code agent does with recall.mjs. Pure and
// dependency-free (type-only import) → unit-testable without a DB.
//
// Score per note = Σ over query words of:
//   term frequency in body  +  (word in title ? 5 : 0)  +  (word in a tag ? 3 : 0)
// Notes with score 0 are dropped. Snippet is a window around the first hit.

export type RankedNote = MemoryNote & { score: number; snippet: string };

export function rankNotes(notes: MemoryNote[], query: string, limit = 6): RankedNote[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const scored: RankedNote[] = [];
  for (const n of notes) {
    const body = n.body ?? '';
    const lower = body.toLowerCase();
    const titleLower = (n.title ?? '').toLowerCase();
    const tagsLower = (n.tags ?? []).map((t) => t.toLowerCase());

    let score = 0;
    for (const w of words) {
      const inBody = lower.split(w).length - 1; // term frequency
      const inTitle = titleLower.includes(w) ? 5 : 0; // title weight (from recall.mjs)
      const inTag = tagsLower.some((t) => t.includes(w)) ? 3 : 0;
      score += inBody + inTitle + inTag;
    }
    if (score <= 0) continue;

    const idx = lower.indexOf(words[0]);
    const start = Math.max(0, idx - 90);
    const raw = idx >= 0 ? body.slice(start, idx + 160) : body.slice(0, 250);
    const snippet = raw.replace(/\s+/g, ' ').trim();
    scored.push({ ...n, score, snippet });
  }

  // Highest score first; ties broken by most-recently-updated.
  scored.sort((a, b) => b.score - a.score || (a.updatedAt < b.updatedAt ? 1 : -1));
  return scored.slice(0, limit);
}
