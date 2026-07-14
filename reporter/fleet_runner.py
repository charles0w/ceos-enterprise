"""Unattended runner — closes the loop from a queued run-request to a real run.

The dashboard files run-requests onto the delegation queue (a `fleet_tasks` row
titled "Run requested"), either from the auto-remediation runbook, a hook, or the
"Run" button. This runner, scheduled from an agent repo (cron / launchd / a
GitHub Action), picks those up and actually runs the agent — then closes the task
and reports, which posts a brief to #notifs via /api/report.

Vendor `ceo_report.py`, `fleet_tasks.py`, and this file into the agent repo.

Two commands:

    python fleet_runner.py run      # ALWAYS run the agent (use this on a cron for
                                    # SCHEDULED agents), then close any pending
                                    # run-requests. Every run reports → #notifs brief.

    python fleet_runner.py drain    # run ONLY if a run-request is queued (use this
                                    # for ON-DEMAND agents polled on a light cadence).

Env:
    FLEET_AGENT_ID       — which agent this is (or hardcode AGENT_ID in fleet_tasks.py)
    FLEET_RUN_CMD        — shell command that runs the agent, e.g. "python main.py"
    CEOS_REPORT_SECRET   — same secret as ceo_report / the dashboard
    CEOS_DASHBOARD_URL   — optional, defaults to https://ceos-enterprise.vercel.app
    FLEET_RUNNER_REPORT  — "0" to suppress the runner's own report (set this if your
                           agent already calls ceo_report.report() so you don't get
                           two briefs). Default: the runner reports.
    FLEET_RUN_TIMEOUT    — seconds before the run is killed (default 1800)
"""
from __future__ import annotations

import os
import subprocess
import sys

from fleet_tasks import fetch_tasks, update_task, AGENT_ID

try:
    from ceo_report import report
except Exception:  # ceo_report optional — runner still closes tasks without it
    report = None

RUN_CMD = os.environ.get("FLEET_RUN_CMD", "").strip()
RUN_TIMEOUT = int(os.environ.get("FLEET_RUN_TIMEOUT", "1800"))
DO_REPORT = os.environ.get("FLEET_RUNNER_REPORT", "1") != "0"
RUN_TITLE = "Run requested"


def _summary_from(output: str, code: int) -> str:
    """Last non-empty stdout line makes the run brief; fall back to exit status."""
    for line in reversed((output or "").splitlines()):
        if line.strip():
            return line.strip()[:180]
    return "run complete" if code == 0 else f"run failed (exit {code})"


def run_agent() -> tuple[bool, str]:
    """Execute FLEET_RUN_CMD once. Returns (ok, summary)."""
    if not RUN_CMD:
        return False, "FLEET_RUN_CMD not set — nothing to run"
    try:
        proc = subprocess.run(
            RUN_CMD, shell=True, capture_output=True, text=True, timeout=RUN_TIMEOUT
        )
    except subprocess.TimeoutExpired:
        return False, f"run timed out after {RUN_TIMEOUT}s"
    ok = proc.returncode == 0
    summary = _summary_from(proc.stdout + "\n" + proc.stderr, proc.returncode)
    # Surface child output for the CI/cron log.
    if proc.stdout:
        print(proc.stdout, end="")
    if proc.stderr:
        print(proc.stderr, end="", file=sys.stderr)
    return ok, summary


def _pending_run_requests() -> list[dict]:
    return [t for t in fetch_tasks("queued") if t.get("title") == RUN_TITLE]


def _close(tasks: list[dict], status: str) -> None:
    for t in tasks:
        update_task(int(t["id"]), status)


def service(force: bool) -> int:
    """force=True → always run (scheduled). force=False → run only if requested."""
    pending = _pending_run_requests()
    if not force and not pending:
        print(f"[{AGENT_ID}] no run-requests queued — nothing to do")
        return 0

    reason = "scheduled" if force else f"{len(pending)} run-request(s)"
    print(f"[{AGENT_ID}] running ({reason}) → {RUN_CMD!r}")

    # Mark requests in-progress so the dashboard reflects the active run.
    _close(pending, "in_progress")

    ok, summary = run_agent()

    # Close the requests: done on success, dropped on failure (so they don't loop).
    _close(pending, "done" if ok else "dropped")

    if DO_REPORT and report is not None:
        try:
            report(AGENT_ID, ok=ok, summary=summary)
        except Exception as e:  # reporting must never fail the run
            print(f"[{AGENT_ID}] report failed: {e}", file=sys.stderr)

    print(f"[{AGENT_ID}] {'ok' if ok else 'FAILED'} — {summary}")
    return 0 if ok else 1


def main() -> None:
    if not AGENT_ID:
        print("set FLEET_AGENT_ID (or hardcode AGENT_ID in fleet_tasks.py)")
        sys.exit(2)
    cmd = sys.argv[1] if len(sys.argv) > 1 else "drain"
    if cmd == "run":
        sys.exit(service(force=True))
    if cmd == "drain":
        sys.exit(service(force=False))
    print(f"usage: fleet_runner.py [run|drain]  (got {cmd!r})")
    sys.exit(2)


if __name__ == "__main__":
    main()
