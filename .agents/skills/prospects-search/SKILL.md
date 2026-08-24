---
name: prospects-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Prospects
  (prospects.ac.uk), the UK graduate careers service run by Jisc — graduate
  jobs, graduate schemes, and internships across the United Kingdom. Invoke
  for graduate roles across sectors, graduate schemes, or internship
  searches. Trigger phrases: prospects, prospects.ac.uk, UK graduate jobs,
  graduate scheme, graduate marketing, internship UK, "graduate jobs
  on prospects".
context: fork
allowed-tools: Bash(bun run .agents/skills/prospects-search/cli/src/cli.ts *)
---

# Prospects Search Skill

Search live UK graduate opportunities from Prospects.ac.uk — graduate jobs,
graduate schemes, and internships. No authentication, no API key, **zero
runtime dependencies** (just `bun`).

## How it works (and robots stance)

The Prospects search page (`/graduate-jobs?keywords=...`) is a client-rendered
AngularJS app — plain HTTP fetches of it return an empty shell. The CLI
instead calls the site's own public JSON endpoint, **`GET /api/jobs`**, the
same one the page's JavaScript calls. It returns plain JSON to a normal fetch.

`robots.txt` (checked 2026-07-17) disallows only `/redirect/`, `/apply?id=*`
and `/partials/`. Everything this CLI touches (`/api/jobs`, the
`/graduate-jobs/...` job URLs it emits) is **allowed**, and the disallowed
paths are never fetched. Still: **personal use only, keep volume low, no bulk
collection.** The board is small (~250 live postings total), so a handful of
requests covers it.

## Commands

```bash
bun run .agents/skills/prospects-search/cli/src/cli.ts search -q "marketing" [flags]
```

Flags:
- `--query <text>` / `-q` — keyword search (**required**). The board only
  lists graduate-level roles, so plain role names work ("marketing",
  "policy adviser") — no need to prefix "graduate".
- `--sort dp|rl` / `-s` — `dp` = date posted, newest first (default);
  `rl` = relevance.
- `--page <n>` — 1-indexed page (max 40 results/page).
- `--limit <n>` / `-n` — cap results emitted (client-side). Default 20.
- `--jobage <days>` — **not supported by Prospects** (no posting dates are
  published, only closing dates). Accepted and ignored for cross-portal
  compatibility. Results carry an `isNew` boolean instead.
- `--location <x>` — **not supported server-side** (the API ignores the UI's
  facet params). Accepted and ignored; filter the `location` field downstream.
- `--format json|table|plain` — default `json`.

## Usage examples

```bash
# Newest marketing roles UK-wide
bun run .agents/skills/prospects-search/cli/src/cli.ts search -q "marketing" --limit 20 --format table

# Human resources roles, JSON for scripting
bun run .agents/skills/prospects-search/cli/src/cli.ts search -q "human resources" --format json

# Relevance-ranked finance roles
bun run .agents/skills/prospects-search/cli/src/cli.ts search -q "finance" --sort rl --limit 10
```

## Output shape

`json` format emits `{ meta: { count, page, total, lastPage }, results: [...] }`
where each result has: `id`, `title`, `company`, `location`, `date` (always
`null` — see below), `deadline`, `salary`, `type` (`graduate job` |
`graduate scheme` | `internship` | ...), `isNew`, `url`.

Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code 1.

## Notes & fragility

- **No posting dates.** Prospects publishes application **closing dates**
  only: `date` is always `null`; `deadline` is ISO `yyyy-mm-dd` or
  `"Ongoing"` (continuous recruitment). Daily dedupe against
  `seen_jobs.json` is what surfaces new listings.
- **API quirks** (reverse-engineered from the app bundle, may change without
  notice):
  - the filter param is `keyword` (singular) — `keywords` (as in the page
    URL) is silently ignored and returns the whole board;
  - `size` below ~5 can 500 server-side, so the CLI always requests ≥10;
  - API pages are 0-indexed (the CLI exposes 1-indexed `--page`);
  - facet params (location, salary, job type) are ignored on bare API calls.
- **URLs**: emitted as `prospects.ac.uk/graduate-jobs/<slug>-<id>`, which
  301s to the canonical employer-profile job URL. The id alone drives the
  lookup, so these links stay valid even if the slug changes.
- **Job detail pages are server-rendered** — a plain fetch with a Chrome UA
  returns full HTML including the description, so WebFetch on a result `url`
  works if the full posting text is needed (no `detail` command yet).
- The HTML pages 403 without a browser User-Agent; the CLI sends a Chrome UA.
  `/api/jobs` currently answers any UA. If the API ever moves behind
  Cloudflare's bot check, the fallback is driving a real browser
  (agent-browser) — see the git history of this skill for the investigation.
- Rate limiting: the CLI retries 429/5xx with exponential backoff + jitter.
