"""
Minimal reporter for CEO Enterprise.

Drop this file into any agent repo and call report() at the end of a run:

    from ceo_report import report
    report("finance", ok=True, summary="EOD recap done — NVDA +2.3%")

Required env vars (add to .env or GitHub Actions secrets):
    CEOS_REPORT_URL    https://ceos-enterprise.vercel.app/api/report
    CEOS_REPORT_SECRET <value from Vercel project env vars>
"""
import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone


REPORT_URL = os.environ.get("CEOS_REPORT_URL", "https://ceos-enterprise.vercel.app/api/report")
REPORT_SECRET = os.environ.get("CEOS_REPORT_SECRET", "")


def report(
    agent_id: str,
    *,
    ok: bool,
    summary: str,
    state: str | None = None,
) -> bool:
    """Post a status report to CEO Enterprise. Returns True on success."""
    if not REPORT_SECRET:
        print(f"[ceo_report] CEOS_REPORT_SECRET not set — skipping report for {agent_id}")
        return False

    payload = {
        "agentId": agent_id,
        "status": {
            "state": state or ("ok" if ok else "error"),
            "lastRun": datetime.now(timezone.utc).isoformat(),
            "summary": summary,
            "ok": ok,
        },
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        REPORT_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-report-secret": REPORT_SECRET,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            ok_status = resp.status == 200
            print(f"[ceo_report] reported {agent_id} → {payload['status']['state']}")
            return ok_status
    except urllib.error.HTTPError as e:
        print(f"[ceo_report] HTTP {e.code} reporting {agent_id}: {e.read().decode()}")
    except Exception as e:
        print(f"[ceo_report] failed to report {agent_id}: {e}")
    return False
