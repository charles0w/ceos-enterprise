"""
Minimal reporter for CEO Enterprise.

Drop this file into any agent repo and call report() at the end of a run:

    from ceo_report import report
    report("finance", ok=True, summary="EOD recap done — NVDA +2.3%")

────────────────────────────────────────────────────────────────────────
CARD DATA + PROFIT (optional)
────────────────────────────────────────────────────────────────────────
Give your dashboard card real numbers and a real progress bar:

    report("commerce", ok=True, summary="Reconciling 14 open orders",
           progress=0.62,                                  # 0..1 through the task
           metrics=[{"label": "Orders / 24h", "value": 41},
                    {"label": "GMV today", "value": 2840, "money": True},
                    {"label": "Margin", "value": 31, "unit": "%"}])

When a run REALIZES profit (a sale closed, a flip sold, a position exited),
log it once — it funds The Garage on the dashboard (agent profit only):

    report("commerce", ok=True, summary="Card flip closed",
           profit=310.0, profit_note="PSA 10 Charizard flip")

Send profit only for newly realized wins (losses are negative), never on
routine heartbeats — the ledger is append-only and double-counts repeats.

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
           eval_score=ev["score"], eval_summary=ev["summary"],
           eval_reliability=rel["rate"])

    # rel also has ci_low, ci_high, n for display:
    print(f"reliability: {rel['rate']:.0%} [{rel['ci_low']:.0%}–{rel['ci_high']:.0%}] n={rel['n']}")

Criteria reference lives in the vault eval KB: research/ai-evals/kb and the
per-agent rubrics in research/ai-evals/criteria.

Required env vars (add to .env or GitHub Actions secrets):
    CEOS_REPORT_URL    https://ceos-enterprise.vercel.app/api/report
    CEOS_REPORT_SECRET <value from Vercel project env vars (= REPORT_SECRET)>

judge() provider — pick ONE:
    Anthropic (native):
        ANTHROPIC_API_KEY   <key>
        EVAL_JUDGE_MODEL    optional, default claude-haiku-4-5-20251001
    OpenAI-compatible (OpenAI, Gemini, Ollama, Groq, ...):
        EVAL_JUDGE_URL      e.g. https://api.openai.com/v1/chat/completions
                               or http://localhost:11434/v1/chat/completions (Ollama)
        EVAL_JUDGE_KEY      <key>  (use "ollama" for local Ollama — ignored but required)
        EVAL_JUDGE_MODEL    e.g. gpt-4o-mini or qwen2.5:7b
    Force one explicitly with EVAL_JUDGE_PROVIDER = "anthropic" | "openai".

> Rigor note (vault kb/judge-biases): judge with a DIFFERENT model family than the
> one that generated the output, or self-preference bias inflates the score.
> judge(both=True) calls both providers and returns agreement/delta for a quick
> cross-family sanity check on a single output.
"""
from __future__ import annotations

import math
import os
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

_STRICT_SUFFIX = (
    "\n\nCRITICAL: output ONLY the JSON object "
    '{"score": <0.0 to 1.0>, "summary": "<one sentence>"}. '
    "No explanation, no markdown, no extra keys."
)


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def wilson_ci(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score confidence interval for a proportion k/n.

    Returns (low, high) — a 95% CI by default.
    Example: lo, hi = wilson_ci(hits, n); print(f"{hits/n:.0%} [{lo:.0%}, {hi:.0%}] n={n}")
    """
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = (z / denom) * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (max(0.0, centre - half), min(1.0, centre + half))


def report(
    agent_id: str,
    *,
    ok: bool,
    summary: str,
    state: str | None = None,
    eval_score: float | None = None,
    eval_reliability: float | None = None,
    eval_summary: str | None = None,
    metrics: list[dict] | None = None,
    progress: float | None = None,
    profit: float | None = None,
    profit_note: str | None = None,
) -> bool:
    """Post a status report to CEO Enterprise. Returns True on success.

    Pass eval_score / eval_reliability (both 0..1) and eval_summary to surface
    the run's QUALITY on the dashboard, not just whether it completed.
    eval_reliability should be rel["rate"] from track_reliability().

    metrics: up to 3 dicts {"label", "value", "unit"?, "money"?, "signed"?}
    shown on the agent's card. progress: 0..1 through the current task.
    profit: realized profit/loss in USD for THIS run (send once per win,
    never on heartbeats) — appended to the Garage ledger with profit_note.
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
    if metrics is not None:
        status["metrics"] = metrics[:3]
    if progress is not None:
        status["progress"] = round(_clamp01(progress), 4)

    payload: dict = {"agentId": agent_id, "status": status}
    if profit is not None and float(profit) != 0.0:
        payload["profit"] = {"amount": float(profit)}
        if profit_note:
            payload["profit"]["note"] = profit_note
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


def _judge_prompt(output: str, criteria: str, suffix: str = "") -> str:
    return (
        "You are a strict evaluation judge. Score the AGENT OUTPUT from 0.0 to 1.0 "
        "against the CRITERIA. Penalize unsupported claims and missing requirements. "
        "Do not reward length. Respond ONLY with compact JSON: "
        '{"score": <float 0..1>, "summary": "<one sentence>"}.\n\n'
        f"CRITERIA:\n{criteria}\n\nAGENT OUTPUT:\n{output}\n{suffix}"
    )


def _extract_json_object(text: str) -> str | None:
    """Return the first balanced JSON object in text, or None."""
    start = text.find("{")
    if start == -1:
        return None
    depth, in_str, esc = 0, False, False
    for i, ch in enumerate(text[start:], start):
        if esc:
            esc = False
            continue
        if ch == "\\" and in_str:
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _parse_judge(content: str) -> dict:
    """Parse judge JSON. Raises ValueError if no valid schema-conforming object is found."""
    for candidate in (content.strip(), _extract_json_object(content)):
        if candidate is None:
            continue
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if "score" not in parsed:
            continue
        try:
            score = float(parsed["score"])
        except (TypeError, ValueError):
            continue
        if not (0.0 <= score <= 1.0):
            raise ValueError(f"score {score!r} out of range [0, 1]")
        return {"score": _clamp01(score), "summary": str(parsed.get("summary", "")).strip()}
    raise ValueError(f"no valid judge JSON in: {content[:200]!r}")


def judge(output: str, criteria: str, *, model: str | None = None, both: bool = False) -> dict:
    """LLM-as-a-judge: score `output` (0..1) against `criteria` with a rationale.

    Auto-selects provider: Anthropic if ANTHROPIC_API_KEY is set, else an
    OpenAI-compatible endpoint if EVAL_JUDGE_URL/KEY are set. Override with
    EVAL_JUDGE_PROVIDER. Returns {"score": float|None, "summary": str}.

    With both=True (requires both providers configured): also returns
    {"anthropic": {...}, "openai": {...}, "agreement": bool|None, "delta": float|None}.
    agreement = both sides agree when thresholded at 0.7. Accumulate across N calls
    for dataset-level kappa.

    NOTE (vault kb/who-validates-the-validators): an unvalidated judge is just a
    confident guess — hand-grade a sample and confirm agreement before trusting it.
    """
    provider = JUDGE_PROVIDER or ("anthropic" if ANTHROPIC_KEY else ("openai" if (JUDGE_URL and JUDGE_KEY) else ""))
    if not both:
        if provider == "anthropic":
            return _judge_anthropic(output, criteria, model)
        if provider == "openai":
            return _judge_openai(output, criteria, model)
        return {"score": None, "summary": "judge not configured (set ANTHROPIC_API_KEY or EVAL_JUDGE_URL/KEY)"}

    a = _judge_anthropic(output, criteria, model) if ANTHROPIC_KEY else {"score": None, "summary": "ANTHROPIC_API_KEY not set"}
    o = _judge_openai(output, criteria, model) if (JUDGE_URL and JUDGE_KEY) else {"score": None, "summary": "EVAL_JUDGE_URL/KEY not set"}
    sa, so = a.get("score"), o.get("score")
    if sa is not None and so is not None:
        score = (sa + so) / 2
        agreement = (sa >= 0.7) == (so >= 0.7)
        delta = abs(sa - so)
    else:
        score = sa if sa is not None else so
        agreement, delta = None, None
    return {
        "score": score,
        "summary": a["summary"] if sa is not None else o["summary"],
        "anthropic": a,
        "openai": o,
        "agreement": agreement,
        "delta": delta,
    }


def _judge_anthropic(output: str, criteria: str, model: str | None) -> dict:
    if not ANTHROPIC_KEY:
        return {"score": None, "summary": "ANTHROPIC_API_KEY not set"}
    for attempt, suffix in enumerate(("", _STRICT_SUFFIX)):
        body = json.dumps({
            "model": model or JUDGE_MODEL or "claude-haiku-4-5-20251001",
            "max_tokens": 256,
            "messages": [{"role": "user", "content": _judge_prompt(output, criteria, suffix)}],
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
        except ValueError as e:
            if attempt == 0:
                print(f"[ceo_report] parse failed, retrying with strict prompt: {e}")
                continue
            print(f"[ceo_report] parse failed after retry: {e}")
            return {"score": None, "summary": f"judge parse error: {e}"}
        except Exception as e:
            print(f"[ceo_report] anthropic judge failed: {e}")
            return {"score": None, "summary": f"judge error: {e}"}
    return {"score": None, "summary": "judge parse error after retry"}


def _judge_openai(output: str, criteria: str, model: str | None) -> dict:
    if not (JUDGE_URL and JUDGE_KEY):
        return {"score": None, "summary": "EVAL_JUDGE_URL/KEY not set"}
    for attempt, suffix in enumerate(("", _STRICT_SUFFIX)):
        body = json.dumps({
            "model": model or JUDGE_MODEL or "gpt-4o-mini",
            "messages": [{"role": "user", "content": _judge_prompt(output, criteria, suffix)}],
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
        except ValueError as e:
            if attempt == 0:
                print(f"[ceo_report] parse failed, retrying with strict prompt: {e}")
                continue
            print(f"[ceo_report] parse failed after retry: {e}")
            return {"score": None, "summary": f"judge parse error: {e}"}
        except Exception as e:
            print(f"[ceo_report] openai judge failed: {e}")
            return {"score": None, "summary": f"judge error: {e}"}
    return {"score": None, "summary": "judge parse error after retry"}


def track_reliability(agent_id: str, *, passed: bool, window: int = 8) -> dict:
    """Record this run's pass/fail; return {rate, ci_low, ci_high, n} over the last `window` runs.

    pass^k in its strict form asks 'did ALL k runs pass' (0/1). This returns the smoother
    fraction-passed plus a 95% Wilson CI — 80% [55%, 94%] n=8 is very different from
    80% [74%, 85%] n=100. Pass rel["rate"] to report(eval_reliability=...).
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
    n = len(runs)
    k = sum(runs)
    rate = k / n if n else 0.0
    lo, hi = wilson_ci(k, n)
    return {"rate": rate, "ci_low": lo, "ci_high": hi, "n": n}
