// Build a vault inbox note from a phone capture (Discord /capture). Pure so
// the interactions route stays thin and this is unit-testable.
//
// Each capture becomes its OWN file under inbox/ — never an append to
// inbox/quick-capture.md: obsidian-git commits that file constantly, and a
// Contents-API write racing the Mac's local edits produces real merge
// conflicts in an actively edited file. A uniquely named new file can't
// conflict, and the vault's process-inbox skill already triages any
// non-quick-capture inbox/*.md with zero changes.

const PT = 'America/Los_Angeles';

// YYYYMMDD-HHmmss in PT. Seconds matter: at minute resolution two quick
// captures collide and pushVaultFile silently overwrites (sha update).
function ptStamp(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PT,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  // en-CA hour can render midnight as '24' — normalize.
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.year}${p.month}${p.day}-${hour}${p.minute}${p.second}`;
}

export function buildCaptureNote(
  text: string,
  user: string,
  now: Date
): { path: string; content: string; commitMessage: string } {
  const trimmed = text.trim();
  const path = `inbox/capture-${ptStamp(now)}.md`;
  const content = [
    '---',
    `captured: ${now.toISOString()}`,
    'source: discord',
    `via: ${user}`,
    'tags: [inbox]',
    '---',
    '',
    trimmed,
    '',
  ].join('\n');
  return {
    path,
    content,
    commitMessage: `capture: ${trimmed.slice(0, 60)} (via Discord)`,
  };
}
