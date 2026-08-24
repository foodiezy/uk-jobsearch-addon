"""Daily job scrape: queries installed portal CLIs, dedupes against seen_jobs.json
and the master tracker, writes a dated markdown report to job_scraper/reports/.

Configure via config.toml at the repo root (copy config.example.toml to start).

Run by Windows Task Scheduler every morning. Manual run:
    py job_scraper/daily_scrape.py

Validate a config without touching the network:
    py job_scraper/daily_scrape.py --dry-run
    py job_scraper/daily_scrape.py --dry-run --config examples/denmark.toml
"""
import argparse
import json
import os
import subprocess
import sys
import time
import tomllib
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BUN = Path.home() / ".bun" / "bin" / "bun.exe"
SEEN = REPO / "job_scraper" / "seen_jobs.json"
REPORTS = REPO / "job_scraper" / "reports"


class ConfigError(Exception):
    """Raised for anything wrong with config.toml that the user must fix by hand."""


def load_config(path):
    if not path.exists():
        raise ConfigError(
            f"Config file not found: {path}\n"
            "Copy config.example.toml to config.toml at the repo root and edit it, "
            "then re-run."
        )
    try:
        with path.open("rb") as f:
            return tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f"Could not parse {path}: {e}") from e


def validate_queries(queries_cfg, sources):
    """Every [[queries]] entry's source must exist in [sources]."""
    for q in queries_cfg:
        label = q.get("label", "<unlabeled query>")
        source = q.get("source")
        if source not in sources:
            known = ", ".join(sorted(sources)) or "(none configured)"
            raise ConfigError(
                f"Query '{label}' references unknown source '{source}'. "
                f"Known sources: {known}"
            )


def build_plan(queries_cfg, sources, repo):
    """Resolve each query to an absolute CLI path and the full subprocess argv.

    Does not check anything that requires the network; `exists` just reflects
    whether the CLI file is present on disk so main() can skip it with a warning
    rather than failing the whole run.
    """
    plan = []
    for q in queries_cfg:
        label = q["label"]
        source = q["source"]
        args = list(q.get("args", []))
        cli_path = (repo / sources[source]).resolve()
        exists = cli_path.exists()
        full_argv = [str(BUN), "run", str(cli_path)] + args + ["--format", "json"]
        plan.append({
            "label": label,
            "source": source,
            "cli_path": cli_path,
            "args": args,
            "exists": exists,
            "full_argv": full_argv,
        })
    return plan


def print_plan(plan):
    print(f"{len(plan)} quer{'y' if len(plan) == 1 else 'ies'} configured:\n")
    for entry in plan:
        status = "ok" if entry["exists"] else "MISSING - will be skipped"
        print(f"[{status}] {entry['label']}  (source: {entry['source']})")
        print(f"    cli: {entry['cli_path']}")
        print(f"    argv: {' '.join(entry['full_argv'])}")
        print()


def is_excluded_title(title, excluded_words):
    title = (title or "").lower()
    return any(word and word.lower() in title for word in excluded_words)


def get_excluded_title_words(filters):
    """Read the role-agnostic filter, with compatibility for older configs."""
    return filters.get("excluded_title_words", filters.get("senior_words", []))


def is_blocked_company(company, blocked_companies):
    if not company:
        return False
    company = company.lower()
    return any(b.lower() in company for b in blocked_companies)


def get_tracker_path(settings, env=None):
    """JOBSEARCH_TRACKER env var overrides the config's tracker setting, for people
    who prefer an env var to a path in a config file. Empty/unset either way = skip
    tracker dedupe entirely (must not crash)."""
    env = os.environ if env is None else env
    env_val = env.get("JOBSEARCH_TRACKER")
    if env_val:
        return Path(env_val)
    t = settings.get("tracker", "")
    return Path(t) if t else None


def tracker_keys(tracker_path, company_column=2, skip_rows=2):
    keys = set()
    if tracker_path is None or not tracker_path.exists():
        return keys
    try:
        import openpyxl
        ws = openpyxl.load_workbook(tracker_path, read_only=True).active
        for row in ws.iter_rows(min_row=skip_rows + 1, values_only=True):
            if len(row) > company_column and row[company_column]:
                keys.add(str(row[company_column]).strip().lower())
    except Exception as e:  # noqa: BLE001
        print(f"tracker read failed, continuing without: {e}", file=sys.stderr)
    return keys


def run_query(entry, timeout):
    try:
        proc = subprocess.run(entry["full_argv"], capture_output=True, text=True,
                              encoding="utf-8", timeout=timeout, cwd=REPO)
        if proc.returncode != 0:
            return entry["label"], [], proc.stderr.strip()[:300]
        return entry["label"], json.loads(proc.stdout).get("results", []), None
    except Exception as e:  # noqa: BLE001 - a failed source must not kill the run
        return entry["label"], [], str(e)[:300]


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default=None,
                         help="Path to config TOML (default: config.toml at repo root)")
    parser.add_argument("--dry-run", action="store_true",
                         help="Validate the config and print the query plan; "
                              "run no subprocess or network call")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    config_path = Path(args.config) if args.config else REPO / "config.toml"

    try:
        config = load_config(config_path)
        sources = config.get("sources", {})
        queries_cfg = config.get("queries", [])
        validate_queries(queries_cfg, sources)
    except ConfigError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    plan = build_plan(queries_cfg, sources, REPO)

    if args.dry_run:
        print_plan(plan)
        return

    settings = config.get("settings", {})
    filters = config.get("filters", {})
    excluded_title_words = get_excluded_title_words(filters)
    blocked_companies = filters.get("blocked_companies", [])
    delay = settings.get("polite_delay_seconds", 1.5)
    timeout = settings.get("query_timeout_seconds", 120)

    tracker_path = get_tracker_path(settings)
    tracked_companies = tracker_keys(
        tracker_path,
        settings.get("tracker_company_column", 0),
        settings.get("tracker_skip_rows", 1),
    )

    seen = json.loads(SEEN.read_text(encoding="utf-8")) if SEEN.exists() else {"seen": {}}
    today = date.today().isoformat()

    new_jobs, errors = [], []
    title_filtered_count = 0
    blocked_count = 0
    ran_any = False
    for entry in plan:
        if not entry["exists"]:
            print(f"warning: skipping '{entry['label']}' - CLI not found at "
                  f"{entry['cli_path']}", file=sys.stderr)
            continue
        if ran_any:
            time.sleep(delay)  # polite gap between portal requests
        ran_any = True
        label, results, err = run_query(entry, timeout)
        if err:
            errors.append(f"{label}: {err}")
        for r in results:
            url = r.get("url") or ""
            key = url or f"{r.get('company', '')}|{r.get('title', '')}"
            title = r.get("title") or ""
            company = r.get("company") or ""
            if not key or key in seen["seen"]:
                continue
            if is_excluded_title(title, excluded_title_words):
                title_filtered_count += 1
                continue
            if is_blocked_company(company, blocked_companies):
                blocked_count += 1
                continue
            entry_data = {
                "title": r.get("title"), "company": r.get("company"), "url": url,
                "location": r.get("location"), "date": r.get("date"),
                "first_seen": today, "fit": "unrated", "status": "new",
                "source": label,
            }
            if company.strip().lower() in tracked_companies:
                entry_data["status"] = "skipped"
                entry_data["note"] = "company already in tracker"
            seen["seen"][key] = entry_data
            if entry_data["status"] == "new":
                new_jobs.append(entry_data)

    SEEN.write_text(json.dumps(seen, indent=2, ensure_ascii=False), encoding="utf-8")

    REPORTS.mkdir(exist_ok=True)
    report = REPORTS / f"{today}.md"
    lines = [
        f"# Daily scrape - {today}",
        "",
        f"**{len(new_jobs)} new postings** ({title_filtered_count} title-filtered and "
        f"{blocked_count} company-filtered postings removed; deduped against "
        f"{len(seen['seen'])} previously seen postings and the optional tracker).",
        "",
    ]
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
    lines += [
        "",
        "_Open each original listing before applying; search results can be stale or reposted._",
    ]
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(new_jobs)} new jobs -> {report}")


if __name__ == "__main__":
    main()
