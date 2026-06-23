"""
School / Tutor agent reporter.

Vault-aware heartbeat for the `school` fleet agent. Reads the Fall 2026 course
prep notes in the obi-secondbrain vault, derives a lightweight status (courses
tracked, units, days until the semester starts), and reports it to the CEO OS
dashboard via the shared reporter.

Run:
    CEOS_REPORT_SECRET=$REPORT_SECRET python reporter/school_report.py

Env:
    CEOS_REPORT_SECRET   = ceos-enterprise REPORT_SECRET (required to POST)
    VAULT_DIR            = path to obi-secondbrain (default: ~/Desktop/obi-secondbrain)
    FALL_START           = ISO date the term begins (default: 2026-08-27)
"""
import os
import re
from datetime import date, datetime
from pathlib import Path

from ceo_report import report

VAULT_DIR = Path(os.environ.get("VAULT_DIR", str(Path.home() / "Desktop" / "obi-secondbrain")))
PREP_DIR = VAULT_DIR / "school" / "fall-2026"
FALL_START = os.environ.get("FALL_START", "2026-08-27")


def scan_courses() -> list[dict]:
    """Read each course note's frontmatter for course id, units, status."""
    courses = []
    if not PREP_DIR.exists():
        return courses
    for md in sorted(PREP_DIR.glob("DATA *.md")):
        text = md.read_text(encoding="utf-8", errors="ignore")
        fm = re.search(r"^---\n(.*?)\n---", text, re.DOTALL)
        meta = {}
        if fm:
            for line in fm.group(1).splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
        courses.append({
            "course": meta.get("course", md.stem),
            "units": meta.get("units", "?"),
            "status": meta.get("status", "?"),
        })
    return courses


def main() -> None:
    courses = scan_courses()
    enrolled = [c for c in courses if c["status"] == "enrolled"]
    waitlist = [c for c in courses if c["status"] == "waitlist"]
    units = sum(float(c["units"]) for c in enrolled if c["units"].replace(".", "").isdigit())

    try:
        days_to_term = (date.fromisoformat(FALL_START) - date.today()).days
    except ValueError:
        days_to_term = None

    names = ", ".join(c["course"].split("/")[0].strip() for c in courses) or "no courses tracked"
    summary = (
        f"Fall 2026 prep tracked — {len(enrolled)} enrolled"
        + (f", {len(waitlist)} waitlist" if waitlist else "")
        + f" ({names})."
        + (f" {days_to_term}d to term." if days_to_term is not None else "")
    )

    metrics = [
        {"label": "Courses", "value": len(courses)},
        {"label": "Units", "value": round(units, 1)},
    ]
    if days_to_term is not None:
        metrics.append({"label": "Days to term", "value": days_to_term})

    report("school", ok=True, summary=summary, metrics=metrics)


if __name__ == "__main__":
    main()
