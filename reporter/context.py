"""Fleet context client — read Charles's living Obsidian brain from any agent.

Every agent (cloud or local) pulls context the same way: through the dashboard's
/api/context endpoint, which serves the Postgres mirror of the ai-memory vault
(kept in sync by ai-memory/scripts/sync-db.mjs). The vault stays the source of
truth; this is a read-only projection so a Vercel function or a 3am GitHub Action
can query context without touching Charles's Mac.

Usage:
    from context import recall, get_note, list_notes

    for hit in recall("jobs agent strategy"):     # ranked snippets
        print(hit["title"], "—", hit["snippet"])

    note = get_note("fleet/jobs-agent")            # one full note
    index = list_notes("fleet")                    # index, optionally by kind

CLI:
    python context.py recall "jobs agent strategy"
    python context.py get "fleet/jobs-agent"
    python context.py list core

Env:
    CEOS_REPORT_SECRET (or REPORT_SECRET) — required; same secret as ceo_report.
    CEOS_DASHBOARD_URL — optional, defaults to https://ceos-enterprise.vercel.app

Requires Python 3.9+. No external dependencies.
Canonical TS twin lives in each agent repo (see the fetch snippet in the docs).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_URL = "https://ceos-enterprise.vercel.app"


def _base() -> str:
    return os.environ.get("CEOS_DASHBOARD_URL", DEFAULT_URL).strip().rstrip("/")


def _secret() -> str:
    return (os.environ.get("CEOS_REPORT_SECRET") or os.environ.get("REPORT_SECRET") or "").strip()


def _get(params: dict) -> dict:
    if not _secret():
        raise RuntimeError("CEOS_REPORT_SECRET is not set")
    url = f"{_base()}/api/context?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"x-report-secret": _secret()})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        raise


def recall(query: str, limit: int = 6) -> list[dict]:
    """Ranked context snippets for a query. Each: slug, title, kind, snippet, tags, updatedAt."""
    return _get({"q": query, "limit": limit}).get("results", [])


def get_note(slug: str) -> dict | None:
    """Full note by slug, or None if not found."""
    return _get({"slug": slug}).get("note")


def list_notes(kind: str | None = None) -> list[dict]:
    """Index of notes (slug/title/kind), optionally filtered by kind."""
    return _get({"list": kind or ""}).get("notes", [])


def _cli() -> None:
    args = sys.argv[1:]
    if not args:
        print("usage: context.py [recall <query> | get <slug> | list [kind]]")
        sys.exit(2)
    cmd = args[0]
    if cmd == "recall" and len(args) > 1:
        for h in recall(" ".join(args[1:])):
            print(f"• {h['title']}  [{h['kind']}]  ({h['slug']})")
            print(f"    {h['snippet'][:200]}")
    elif cmd == "get" and len(args) > 1:
        note = get_note(" ".join(args[1:]))
        print(json.dumps(note, indent=2) if note else "not found")
    elif cmd == "list":
        for n in list_notes(args[1] if len(args) > 1 else None):
            print(f"{n['kind']:<10} {n['slug']:<32} {n['title']}")
    else:
        print("usage: context.py [recall <query> | get <slug> | list [kind]]")
        sys.exit(2)


if __name__ == "__main__":
    _cli()
