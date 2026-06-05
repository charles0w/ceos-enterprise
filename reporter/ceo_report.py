"""
Minimal reporter for CEO Enterprise.

Drop this file into any agent repo and call report() at the end of a run:

    from ceo_report import report
    report("finance", ok=True, summary="EOD recap done — NVDA +2.3%")

────────────────────────────────────────────────────────────────────────
EVAL LAYER (optional)
────────────────────────────────────────────────────────────────────────
`ok=True` only means the run *completed*. It says nothing about whether the
output was any good. To attach a quality signal, score the output and pass it
through:

    from ceo_report import report, judge, track_reliability

    out = run_my_agent()
    ev  = judge(out, criteria="Faithful to source data; complete; no hallucinated numbers")
    rel = track_reliability("finance", passed=ev["score"] >= 0.7)
    report("finance", ok=True, summary="EOD recap done",
           eval_score=ev["score"], eval_summary=ev["summary"], eval_reliability=rel)

Criteria reference lives in the vault eval KB: research/ai-evals/kb and the
per-agent rubrics in research/ai-evals/criteria.

Required env vars (add to .env or GitHub Actions secrets):
    CEOS_REPORT_URL    https://ceos-enterprise.vercel.app/api/report
    CEOS_REPORT_SECRET <value from Vercel project env vars (= REPORT_SECRET)>

judge() provider — pick ONE:
    Anthropic (native):
        ANTHROPIC_API_KEY   <key>
        EVAL_JUDGE_MODEL    optional, default claude-haiku-4-5-20251001
    OpenAI-compatible (OpenAI, Gemini OpenAI endpoint, Groq, ...):
        EVAL_JUDGE_URL      e.g. https://api.openai.com/v1/chat/completions
        EVAL_JUDGE_KEY      <key>
        EVAL_JUDGE_MODEL    e.g. gpt-4o-mini
    Force one explicitly with EVAL_JUDGE_PROVIDER = "anthropic" | "openai".

> Rigor note (vault kb/judge-biases): judge with a DIFFERENT model family than the
> one that generated the output, or self-preference bias inflates the score.
"""
import os
import re
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path


REPORT_URL = os.environ.get("CEOS_REPORT_URL", "https://ceos-enterprise.vercel.app/api/report")
REPORT_SECRET = os.environ.get("CEOS_REPORT_SECRET", "")

JUDGE_PROVIDER = os.environ.get("EVAL_JUDGE_PROVIDER", "").lower()  # "anthropic" | "openai" | ""
JUDGE_URL = os.environ.get("EVAL_JUDGE_URL", "")
JUDGE_KEY = os.environ.get("EVAL_JUDGE_KEY", "")
JUDGE_MODEL = os.environ.get("EVAL_JUDGE_MODEL", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

_REL_STORE = Path(os.environ.get("CEOS_EVAL_STORE", str(Path.home() / ".ceos_eval_reliability.json")))


def report(
    agent_id: str,
    *,
    ok: bool,
    summary: str,
    state: str | None = None,
    eval_score: float | None = None,
    eval_reliability: float | None = None,
    eval_summary: str | None = None,
) -> bool:
    """Post a status report to CEO Enterprise. Returns True on success.

    Pass eval_score / eval_reliability (both 0..1) and eval_summary to surface
    the run's QUALITY on the dashboard, not just whether it completed.
    """
    if not REPORT_SECRET:
        print(f"[ceo_report] CEOS_REPORT_SECRET not set — skipping report for {agent_id}")
        return False

    status: dict = {
        "state": state or ("ok" if ok else "error"),
        "lastRun": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "ok": ok,
    }
    if eval_score is not None:
        status["evalScore"] = round(_clamp01(eval_score), 4)
    if eval_reliability is not None:
        status["evalReliability"] = round(_clamp01(eval_reliability), 4)
    if eval_summary is not None:
        status["evalSummary"] = eval_summary

    payload = {"agentId": agent_id, "status": status}
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
            print(f"[ceo_report] reported {agent_id} → {status['state']}"
                  + (f" · q={status.get('evalScore')}" if 'evalScore' in status else ""))
            return ok_status
    except urllib.error.HTTPError as e:
        print(f"[ceo_report] HTTP {e.code} reporting {agent_id}: {e.read().decode()}")
    except Exception as e:
        print(f"[ceo_report] failed to report {agent_id}: {e}")
    return False


def _judge_prompt(output: str, criteria: str) -> str:
    return (
        "You are a strict evaluation judge. Score the AGENT OUTPUT from 0.0 to 1.0 "
        "against the CRITERIA. Penalize unsupported claims and missing requirements. "
        "Do not reward length. Respond ONLY with compact JSON: "
        '{"score": <float 0..1>, "summary": "<one sentence>"}.\n\n'
        f"CRITERIA:\n{criteria}\n\nAGENT OUTPUT:\n{output}\n"
    )


def _parse_judge(content: str) -> dict:
    m = re.search(r"\{.*\}", content, re.DOTALL)
    parsed = json.loads(m.group(0) if m else content)
    return {"score": _clamp01(float(parsed["score"])), "summary": str(parsed.get("summary", "")).strip()}


def judge(output: str, criteria: str, *, model: str | None = None) -> dict:
    """LLM-as-a-judge: score `output` (0..1) against `criteria` with a rationale.

    Auto-selects provider: Anthropic if ANTHROPIC_API_KEY is set, else an
    OpenAI-compatible endpoint if EVAL_JUDGE_URL/KEY are set. Override with
    EVAL_JUDGE_PROVIDER. Returns {"score": float|None, "summary": str}.

    NOTE (vault kb/who-validates-the-validators): an unvalidated judge is just a
    confident guess — hand-grade a sample and confirm agreement before trusting it.
    """
    provider = JUDGE_PROVIDER or ("anthropic" if ANTHROPIC_KEY else ("openai" if (JUDGE_URL and JUDGE_KEY) else ""))
    if provider == "anthropic":
        return _judge_anthropic(output, criteria, model)
    if provider == "openai":
        return _judge_openai(output, criteria, model)
    return {"score": None, "summary": "judge not configured (set ANTHROPIC_API_KEY or EVAL_JUDGE_URL/KEY)"}


def _judge_anthropic(output: str, criteria: str, model: str | None) -> dict:
    if not ANTHROPIC_KEY:
        return {"score": None, "summary": "ANTHROPIC_API_KEY not set"}
    body = json.dumps({
        "model": model or JUDGE_MODEL or "claude-haiku-4-5-20251001",
        "max_tokens": 256,
        "messages": [{"role": "user", "content": _judge_prompt(output, criteria)}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        return _parse_judge(data["content"][0]["text"])
    except Exception as e:
        print(f"[ceo_report] anthropic judge failed: {e}")
        return {"score": None, "summary": f"judge error: {e}"}


def _judge_openai(output: str, criteria: str, model: str | None) -> dict:
    if not (JUDGE_URL and JUDGE_KEY):
        return {"score": None, "summary": "EVAL_JUDGE_URL/KEY not set"}
    body = json.dumps({
        "model": model or JUDGE_MODEL or "gpt-4o-mini",
        "messages": [{"role": "user", "content": _judge_prompt(output, criteria)}],
        "temperature": 0,
    }).encode()
    req = urllib.request.Request(
        JUDGE_URL,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {JUDGE_KEY}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = json.loads(resp.read().decode())["choices"][0]["message"]["content"]
        return _parse_judge(content)
    except Exception as e:
        print(f"[ceo_report] openai judge failed: {e}")
        return {"score": None, "summary": f"judge error: {e}"}


def track_reliability(agent_id: str, *, passed: bool, window: int = 8) -> float:
    """Record this run's pass/fail and return the recent pass-rate over the last
    `window` runs (a pass^k-style consistency proxy; see vault kb/pass-k-reliability).
    """
    try:
        history = json.loads(_REL_STORE.read_text()) if _REL_STORE.exists() else {}
    except Exception:
        history = {}
    runs = history.get(agent_id, [])
    runs.append(bool(passed))
    runs = runs[-window:]
    history[agent_id] = runs
    try:
        _REL_STORE.write_text(json.dumps(history))
    except Exception as e:
        print(f"[ceo_report] could not persist reliability: {e}")
    return sum(runs) / len(runs) if runs else 0.0


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))
