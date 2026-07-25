---
name: gradcracker-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Gradcracker
  (gradcracker.com), the UK careers board for STEM students and graduates —
  graduate jobs, graduate schemes, placements/internships, and degree
  apprenticeships across the United Kingdom. Invoke for UK graduate software
  engineering roles, tech graduate schemes, STEM placements, or looking up a
  specific Gradcracker posting. Trigger phrases: gradcracker, UK graduate jobs,
  graduate scheme, grad scheme, graduate software engineer, STEM jobs UK,
  placement year, summer internship UK, degree apprenticeship, "graduate jobs
  in <UK region>".
context: fork
allowed-tools: Bash(bun run .agents/skills/gradcracker-search/cli/src/cli.ts *)
---

# Gradcracker Search Skill

Search live UK graduate/STEM opportunities from Gradcracker's public pages —
graduate jobs, work placements/internships, and degree apprenticeships. No
authentication, no API key, **zero runtime dependencies** (just `bun`).

Gradcracker is discipline-organised (e.g. computing/technology, aerospace,
civil). The CLI supports **both** of its search surfaces:

- **Keyword search** (`--query`): site-wide free-text search.
- **Discipline browse** (no `--query`): the discipline pages, filterable by
  opportunity type and UK region.

## ⚠️ Personal use only

Gradcracker's `robots.txt` **disallows** its `/keyword-search` path — the
endpoint the `--query` flag uses. The discipline-browse pages (the default,
no-`--query` mode) are allowed. Either way: **keep volume low, no commercial
or bulk data collection, run it on your own responsibility.** Prefer browse
mode when a discipline page covers what you need. The CLI never fetches the
robots-disallowed `/out` redirect links — apply URLs are decoded locally.

## When to use this skill

- Find UK graduate jobs, placements/internships, or degree apprenticeships
- Browse a discipline (default: computing-technology) or filter by UK region
- Get the full description, deadline, salary, and direct apply link for a posting

## Commands

### Search

```bash
bun run .agents/skills/gradcracker-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q` — site-wide keyword search (e.g. `"software engineer"`). Cannot be combined with `--location`.
- `--discipline <slug>` / `-d` — browse-mode discipline. Default `computing-technology`. Others: `aerospace`, `chemical-process`, `civil-building`, `electronic-electrical`, `mechanical-engineering`, `science-maths`, `all-disciplines`, …
- `--type <t>` / `-t` — `all` (default) | `graduate-jobs` | `placements` | `apprenticeships`. Works in both modes.
- `--location <region>` / `-l` — **browse mode only.** UK region, not city: `east-midlands`, `london` (→ London & South East), `scotland`, `north-west`, `yorkshire`, … With `--query`, include the place in the query text instead (e.g. `-q "software engineer london"`).
- `--jobage <days>` — **not supported by Gradcracker** (no posting dates published, only deadlines). Accepted and ignored for cross-portal compatibility.
- `--page <n>` — 1-indexed page (~16 results/page browse, ~40/page keyword).
- `--limit <n>` / `-n` — cap results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/gradcracker-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the composite id from `search` results (e.g. `1088-81498` =
`<hubId>-<jobId>`). A full `gradcracker.com/hub/...` URL also works. A bare
job number does **not** — Gradcracker's job routes need the employer's hub id
too. Returns description, deadline, salary, degree requirement, disciplines,
and the decoded external apply link.

## Usage examples

```bash
# Software engineer roles UK-wide (keyword search)
bun run .agents/skills/gradcracker-search/cli/src/cli.ts search -q "software engineer" --limit 10 --format table

# Computing/technology graduate jobs in the East Midlands (Nottingham's region)
bun run .agents/skills/gradcracker-search/cli/src/cli.ts search -t graduate-jobs -l east-midlands --format table

# Placement-year / internship roles in computing
bun run .agents/skills/gradcracker-search/cli/src/cli.ts search -t placements --format table

# AI/ML keyword search, second page
bun run .agents/skills/gradcracker-search/cli/src/cli.ts search -q "machine learning" --page 2 --format table

# Degree apprenticeships in London & the South East
bun run .agents/skills/gradcracker-search/cli/src/cli.ts search -t apprenticeships -l london --format table

# Full details + apply link for one posting
bun run .agents/skills/gradcracker-search/cli/src/cli.ts detail 1088-81498 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning (shows deadline column) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **No posting dates.** Gradcracker publishes application **deadlines**, not
  posting dates: every result's `date` is `null` and a `deadline` field is
  provided instead (ISO `yyyy-mm-dd` when parseable, else e.g. `"Ongoing"`).
  `--jobage` therefore cannot be honored.
- Result ids are composite `<hubId>-<jobId>` (e.g. `1088-81498`) because
  detail URLs require both. Pass them to `detail` as-is.
- Results include extra fields: `deadline`, `salary`, `type` (`graduate-job` |
  `work-placement-internship` | `degree-apprenticeship`), `disciplines`.
- Location filtering is by **UK region facet** (15 regions incl. Europe/RoW
  variants), not by city. Region pages also include multi-location postings
  ("Multiple UK Locations").
- The site's WAF rejects spoofed Chrome User-Agents (403); the CLI sends a
  Firefox UA, which passes. See `url-reference.md` if 403s reappear.
- Rate limiting: the CLI retries 429/5xx with exponential backoff + jitter.
