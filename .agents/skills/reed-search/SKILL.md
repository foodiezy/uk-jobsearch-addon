---
name: reed-search
version: 1.0.0
description: >
  Use this skill to search live job listings on Reed.co.uk — one of the UK's
  largest job boards — via its official Jobseeker API, or to look up a specific
  Reed posting. Best for jobs in the United Kingdom: graduate schemes, junior and
  experienced roles across all sectors, filterable by location (city + radius in
  miles), graduate positions, and salary. Trigger phrases: find UK jobs, jobs on
  Reed, Reed.co.uk, search Reed, graduate jobs UK, part-time jobs UK,
  jobs in Bristol/London/Manchester, UK vacancies, jobs near me UK,
  look up this Reed job posting.
context: fork
allowed-tools: Bash(bun run .agents/skills/reed-search/cli/src/cli.ts *)
---

# Reed Search Skill

Search live job listings from **[Reed.co.uk](https://www.reed.co.uk)** — one of the
UK's largest job boards — via its **official, free Jobseeker API**. Structured JSON
(no HTML scraping), **zero runtime dependencies** — it runs with just `bun` and a
free API key.

> Unlike the HTML-scraping portal skills, this uses Reed's sanctioned developer API
> (https://www.reed.co.uk/developers/jobseeker), so there is no ToS concern for
> personal use — but a key is **required** and usage is subject to Reed's API terms
> shown at registration. Keep the key private.

## 🔑 Requires a free API key

Register at <https://www.reed.co.uk/developers/jobseeker> and set the
`REED_API_KEY` environment variable (see `cli/README.md` for `setx` / `$env:` /
`export` forms). If unset, every command exits `1` with
`{"code":"NO_API_KEY"}` on stderr; a rejected key maps to `{"code":"INVALID_API_KEY"}`.

## When to use this skill

- Search UK job openings by keyword and location (city + radius in miles)
- Filter to graduate positions (`--graduate`) or by recency (`--jobage`, client-side)
- Get the full description, contract type, and salary of a specific Reed posting

## Commands

### Search job listings

```bash
bun run .agents/skills/reed-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords (title, skill, role). Maps to Reed's `keywords`.
- `--location <text>` / `-l <text>` — UK place name, e.g. `"Bristol"`, `"London"`, `"Manchester"`. Maps to `locationName`.
- `--distance <miles>` — radius from `--location` (Reed's `distanceFromLocation`; Reed defaults to 10 miles).
- `--graduate` — only graduate positions (Reed's server-side `graduate` filter).
- `--jobage <days>` — posted within N days. **Client-side**: Reed's API has no posting-age parameter, so the CLI filters on each result's `date`; jobs without a parseable date are dropped when this flag is set.
- `--page <n>` — 1-indexed page, **100 results per page** (translated to `resultsToSkip`/`resultsToTake`).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/reed-search/cli/src/cli.ts detail <jobId|url> [--format json|plain]
```

`jobId` is the numeric `id` from `search` results. A full
`https://www.reed.co.uk/jobs/<slug>/<id>` URL also works. Returns the full
(HTML-stripped) description, contract type, full/part-time flags, salary range and
type, posted/expiry dates, and the external apply URL when present.

## Usage examples

```bash
# Project coordinator roles within 30 miles of Bristol
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "project coordinator" -l "Bristol" --distance 30 --format table

# Graduate marketing roles anywhere in the UK, posted in the last 7 days
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "marketing" --graduate --jobage 7 --limit 10 --format table

# Part-time administration roles in London
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "part time administrator" -l "London" --format table

# Remote-ish: Reed treats remote as a keyword, not a parameter
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "remote customer service" --limit 10

# Full details for a specific job
bun run .agents/skills/reed-search/cli/src/cli.ts detail 55555555 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing `id` to `detail` |
| `table` | Quick human-readable scanning (includes salary column) |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "totalResults" }, "results": [...] }`;
each result carries at least `id`, `title`, `company`, `location`, `date`, `url`
(missing values are `null`), plus Reed extras: `salaryMin`, `salaryMax`, `currency`,
`expirationDate`, `applications`. All errors go to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **Official API** — data comes from `https://www.reed.co.uk/api/1.0/...` with HTTP
  Basic auth (API key as username, empty password). See `url-reference.md`.
- **UK only** — Reed is a UK job board; `--location` expects UK place names.
- **No server-side date filter** — `--jobage` is applied client-side within the
  fetched page (up to 100 results); for exhaustive recency sweeps, page through.
- **No remote-work parameter** — include "remote" in `--query` instead.
- Dates are normalized from Reed's `DD/MM/YYYY` to ISO `YYYY-MM-DD`.
- The CLI retries 429/5xx with exponential backoff + jitter (max 6 retries).
- Job IDs are numeric — pass them as-is to `detail`.
