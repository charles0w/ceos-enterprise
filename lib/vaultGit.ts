// Commit a file into the Obsidian vault's GitHub repo via the Contents API.
// The CEO runs on Vercel and can't shell out to git, so each CEO-authored note
// (session logs, append_memory learnings) is committed to obi-secondbrain through
// the API — so every session is pushed to GitHub and updates ai-memory there.
//
// Requires a GitHub token with Contents:write on the vault repo, as env var
// GITHUB_TOKEN. Optional: GITHUB_VAULT_REPO (default charles0w/obi-secondbrain),
// GITHUB_VAULT_BRANCH (default main). Without the token this no-ops gracefully
// (the note still lives in the Postgres mirror and can be pulled via sync-db.mjs).

const REPO = process.env.GITHUB_VAULT_REPO || 'charles0w/obi-secondbrain';
const BRANCH = process.env.GITHUB_VAULT_BRANCH || 'main';

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export async function pushVaultFile(
  path: string,
  content: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: 'GITHUB_TOKEN not set' };

  const url = `https://api.github.com/repos/${REPO}/contents/${encodePath(path)}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'ceos-enterprise',
    'x-github-api-version': '2022-11-28',
  };
  const b64 = Buffer.from(content, 'utf8').toString('base64');

  // Retry once on a 409 (sha race with obsidian-git or a concurrent write).
  for (let attempt = 0; attempt < 2; attempt++) {
    let sha: string | undefined;
    try {
      const g = await fetch(`${url}?ref=${encodeURIComponent(BRANCH)}`, { headers });
      if (g.ok) sha = (await g.json()).sha as string;
    } catch {
      /* file doesn't exist yet — create it */
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ message, content: b64, branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 409 && attempt === 0) continue;
    return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 200)}` };
  }
  return { ok: false, error: 'retry exhausted' };
}
