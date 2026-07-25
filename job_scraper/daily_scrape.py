"""Daily job scrape: queries installed portal CLIs, dedupes against seen_jobs.json
and the master tracker, writes a dated markdown report to job_scraper/reports/.

Run by Windows Task Scheduler every morning. Manual run:
    py job_scraper/daily_scrape.py
"""
import json
import os
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BUN = Path.home() / ".bun" / "bin" / "bun.exe"
SEEN = REPO / "job_scraper" / "seen_jobs.json"
REPORTS = REPO / "job_scraper" / "reports"
# Optional: point JOBSEARCH_TRACKER at your own tracker spreadsheet to also dedupe
# against roles you have already applied to. Unset = skip tracker dedupe entirely.
_t = os.environ.get("JOBSEARCH_TRACKER")
TRACKER = Path(_t) if _t else None

LINKEDIN = str(REPO / ".agents/skills/linkedin-search/cli/src/cli.ts")
FREEHIRE = str(REPO / ".agents/skills/freehire-search/cli/src/cli.ts")
REED = str(REPO / ".agents/skills/reed-search/cli/src/cli.ts")  # needs REED_API_KEY (user env var)
# Browse mode only in scheduled runs: robots.txt disallows /keyword-search, allows /search/*
GRADCRACKER = str(REPO / ".agents/skills/gradcracker-search/cli/src/cli.ts")
# Uses Prospects' own public JSON endpoint (/api/jobs) — robots-allowed
PROSPECTS = str(REPO / ".agents/skills/prospects-search/cli/src/cli.ts")

# (label, argv) - queries mirror .claude/skills/job-scraper/search-queries.md priorities
QUERIES = [
    ("LinkedIn Nottingham grad", [LINKEDIN, "search", "-q", "graduate software engineer",
     "-l", "Nottingham, England, United Kingdom", "--jobage", "1", "--limit", "15"]),
    ("LinkedIn UK grad SWE", [LINKEDIN, "search", "-q", "graduate software engineer",
     "-l", "United Kingdom", "--jobage", "1", "--limit", "20"]),
    ("LinkedIn UK junior dev", [LINKEDIN, "search", "-q", "junior software developer",
     "-l", "United Kingdom", "--jobage", "1", "--limit", "20"]),
    ("LinkedIn UK remote junior", [LINKEDIN, "search", "-q", "junior software engineer",
     "-l", "United Kingdom", "--remote", "remote", "--jobage", "1", "--limit", "15"]),
    ("LinkedIn UK software dev", [LINKEDIN, "search", "-q", "software developer",
     "-l", "United Kingdom", "--jobage", "1", "--limit", "20"]),
    ("LinkedIn UK web/frontend", [LINKEDIN, "search", "-q", "web developer",
     "-l", "United Kingdom", "--jobage", "1", "--limit", "20"]),
    ("LinkedIn UK fullstack", [LINKEDIN, "search", "-q", "full stack developer",
     "-l", "United Kingdom", "--jobage", "1", "--limit", "20"]),
    ("LinkedIn UK data analyst", [LINKEDIN, "search", "-q", "data analyst",
     "-l", "United Kingdom", "--jobage", "1", "--limit", "15"]),
    # Reed has no server-side age filter; --jobage filters client-side on posting date,
    # so use a slightly wider window and let seen_jobs.json dedupe repeats
    ("Reed UK grad SWE", [REED, "search", "-q", "graduate software engineer",
     "--jobage", "3", "--limit", "50"]),
    ("Reed UK graduate-flag dev", [REED, "search", "-q", "software developer",
     "--graduate", "--jobage", "3", "--limit", "50"]),
    ("Reed Nottingham 30mi", [REED, "search", "-q", "software developer",
     "-l", "Nottingham", "--distance", "30", "--jobage", "5", "--limit", "50"]),
    ("Reed UK web dev", [REED, "search", "-q", "web developer",
     "--jobage", "3", "--limit", "40"]),
    ("Reed UK data analyst", [REED, "search", "-q", "data analyst",
     "--graduate", "--jobage", "3", "--limit", "40"]),
    # Gradcracker publishes deadlines not posting dates (date is always null);
    # dedupe against seen_jobs.json is what surfaces the new listings each day
    ("Gradcracker computing grads p1", [GRADCRACKER, "search", "--discipline", "computing-technology",
     "--type", "graduate-jobs", "--page", "1", "--limit", "40"]),
    ("Gradcracker computing grads p2", [GRADCRACKER, "search", "--discipline", "computing-technology",
     "--type", "graduate-jobs", "--page", "2", "--limit", "40"]),
    ("freehire GB junior", [FREEHIRE, "search", "-q", "software engineer",
     "--country", "GB", "--seniority", "junior", "--jobage", "2", "--limit", "25"]),
    ("freehire GB fullstack junior", [FREEHIRE, "search", "--category", "fullstack,backend,frontend",
     "--country", "GB", "--seniority", "junior", "--jobage", "2", "--limit", "25"]),
    # Prospects publishes closing dates, not posting dates (date is always null);
    # sorted newest-first (default) and deduped against seen_jobs.json daily
    ("Prospects grad SWE", [PROSPECTS, "search", "-q", "software engineer",
     "--limit", "20"]),
    ("Prospects software dev", [PROSPECTS, "search", "-q", "software developer",
     "--limit", "20"]),
    ("Prospects junior dev", [PROSPECTS, "search", "-q", "junior developer",
     "--limit", "20"]),
]

# Titles containing any of these are clearly above entry level and get dropped;
# everything else passes (broad CV: dev, web, data, QA roles all in scope)
SENIOR_WORDS = ("senior", "lead", "principal", "staff", "head of", "manager",
                "director", "architect", "chief", "sr.", "sr ")

def run_query(label, argv):
    argv = argv + ["--format", "json"]
    try:
        proc = subprocess.run([str(BUN), "run"] + argv, capture_output=True,
                              text=True, encoding="utf-8", timeout=120, cwd=REPO)
        if proc.returncode != 0:
            return label, [], proc.stderr.strip()[:300]
        return label, json.loads(proc.stdout).get("results", []), None
    except Exception as e:  # noqa: BLE001 - a failed source must not kill the run
        return label, [], str(e)[:300]


def tracker_keys():
    keys = set()
    if TRACKER is None or not TRACKER.exists():
        return keys
    try:
        import openpyxl
        ws = openpyxl.load_workbook(TRACKER, read_only=True).active
        for row in ws.iter_rows(min_row=3, values_only=True):
            if row[2]:
                keys.add(str(row[2]).strip().lower())
    except Exception as e:  # noqa: BLE001
        print(f"tracker read failed, continuing without: {e}", file=sys.stderr)
    return keys


def main():
    seen = json.loads(SEEN.read_text(encoding="utf-8")) if SEEN.exists() else {"seen": {}}
    tracked_companies = tracker_keys()
    today = date.today().isoformat()

    new_jobs, errors = [], []
    for i, (label, argv) in enumerate(QUERIES):
        if i:
            time.sleep(1.5)  # polite gap between portal requests
        label, results, err = run_query(label, argv)
        if err:
            errors.append(f"{label}: {err}")
        for r in results:
            url = r.get("url") or ""
            key = url or f"{r.get('company', '')}|{r.get('title', '')}"
            title = (r.get("title") or "").lower()
            if not key or key in seen["seen"]:
                continue
            if any(w in title for w in SENIOR_WORDS):
                continue
            entry = {
                "title": r.get("title"), "company": r.get("company"), "url": url,
                "location": r.get("location"), "date": r.get("date"),
                "first_seen": today, "fit": "unrated", "status": "new",
                "source": label,
            }
            if (r.get("company") or "").strip().lower() in tracked_companies:
                entry["status"] = "skipped"
                entry["note"] = "company already in tracker"
            seen["seen"][key] = entry
            if entry["status"] == "new":
                new_jobs.append(entry)

    SEEN.write_text(json.dumps(seen, indent=2, ensure_ascii=False), encoding="utf-8")

    REPORTS.mkdir(exist_ok=True)
    report = REPORTS / f"{today}.md"
    lines = [f"# Daily scrape - {today}", "",
             f"**{len(new_jobs)} new postings** (senior-level titles filtered out; deduped against "
             f"{len(seen['seen'])} previously seen and the master tracker).", ""]
    if new_jobs:
        lines += ["| Title | Company | Location | Posted | Link |",
                  "|---|---|---|---|---|"]
        for j in sorted(new_jobs, key=lambda x: x.get("date") or "", reverse=True):
            lines.append(f"| {j['title']} | {j['company']} | {j.get('location') or '?'} "
                         f"| {j.get('date') or '?'} | [apply]({j['url']}) |")
    else:
        lines.append("No new matches today.")
    if errors:
        lines += ["", "## Source errors", ""] + [f"- {e}" for e in errors]
    lines += ["", "_Review with Claude: open Claude Code in the repo and say "
              "\"review today's scrape report\" for fit assessment._"]
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(new_jobs)} new jobs -> {report}")


if __name__ == "__main__":
    main()
