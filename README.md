# UK job search add-on kit

[![tests](https://github.com/foodiezy/uk-jobsearch-addon/actions/workflows/tests.yml/badge.svg)](https://github.com/foodiezy/uk-jobsearch-addon/actions/workflows/tests.yml)

Three extra job-board sources and a daily scrape runner for the
[`MadsLorentzen/ai-job-search`](https://github.com/MadsLorentzen/ai-job-search) Claude Code
framework. Upstream ships LinkedIn plus several Danish boards; this adds the UK ones and
wires everything into one morning report.

Tuned for a UK computer-science graduate hunting graduate/junior software roles. The search
queries, the Nottingham radius filters and the Gradcracker discipline are all set for that —
change them if your hunt is different.

---

## 1. Install the base framework first

```bash
git clone https://github.com/MadsLorentzen/ai-job-search
cd ai-job-search
```

Follow the repo's own `SETUP.md`. Then unzip this kit **on top of** the clone — it only adds
files, it overwrites nothing:

```
.agents/skills/reed-search/
.agents/skills/gradcracker-search/
.agents/skills/prospects-search/
job_scraper/daily_scrape.py
job_scraper/register_task.ps1
```

## 2. Tools you need

| Tool | Why | Note |
|---|---|---|
| **Claude Code** | runs the whole thing | |
| **Bun** | the portal CLIs are TypeScript | installs to `~/.bun/bin` |
| **Python 3.11+** | `daily_scrape.py` | needs `tomllib` (stdlib since 3.11); on Windows call it as `py`, not `python` — the Microsoft Store alias is a broken stub |
| **MiKTeX** | compiles CV + cover letter | `pdflatex` for the CV, `xelatex` for cover letters |
| **poppler** (`pdftotext`) | ATS check on the compiled CV | optional but worth it |

In each of the three `cli/` folders, run `bun install` once.

## 3. Get your own Reed API key

Free, takes two minutes: <https://www.reed.co.uk/developers/jobseeker>. Set it as a **user**
environment variable:

```powershell
[Environment]::SetEnvironmentVariable("REED_API_KEY", "your-key-here", "User")
```

Don't use someone else's key — rate limits and terms are tied to the account that issued it.
A shell that was already open won't see the new variable; either reopen it or set
`$env:REED_API_KEY` inline for that session.

## 4. Put your own details in

The framework reads your profile from `.claude/skills/job-application-assistant/`. Don't fill
those in by hand — open Claude Code in the repo, paste your CV, and ask it to populate
`01-candidate-profile.md` and `02-behavioral-profile.md` from it. Then read them back and
correct anything it inferred wrongly; it marks guesses with `[Inferred — review]`.

Also update `.claude/skills/job-scraper/search-queries.md` and `config.toml` (see below) so
they agree with each other.

## 5. Configure your search

No Python editing required — every user-specific value (queries, portals, filters, tracker
path) lives in a TOML config file, `config.toml` at the repo root. It's gitignored: copy the
example and edit your copy.

```powershell
copy config.example.toml config.toml
```

Then open `config.toml` and edit the `[[queries]]` blocks, `[filters]`, and `[settings]` to
match your own search. Schema:

```toml
[settings]
tracker = ""                      # optional path to a spreadsheet of roles already applied to
tracker_company_column = 2        # 0-based column holding the company name
tracker_skip_rows = 2              # header rows to skip
polite_delay_seconds = 1.5
query_timeout_seconds = 120

[filters]
senior_words = [...]              # titles containing these are dropped
blocked_companies = [...]         # companies dropped entirely (aggregators, CV harvesters)

[sources]                         # name -> path to that portal CLI's entrypoint, relative to repo root
linkedin = ".agents/skills/linkedin-search/cli/src/cli.ts"
reed = ".agents/skills/reed-search/cli/src/cli.ts"

[[queries]]
label = "LinkedIn UK grad SWE"
source = "linkedin"
args = ["search", "-q", "graduate software engineer", "-l", "United Kingdom", "--jobage", "1", "--limit", "20"]
```

Each `[[queries]]` entry is one portal search: `label` is what shows up in error messages and
the report, `source` must be a key defined under `[sources]`, and `args` is the exact argv
passed to that portal's CLI (see each portal's quirks below, and its skill's `SKILL.md` for the
full flag list). Add a new portal by adding an entry to `[sources]` and one or more
`[[queries]]` blocks that reference it — no Python changes needed. A source's CLI file not
being installed is not fatal: any query using it is skipped with a warning at runtime.

Three ready-made configs live in `examples/`:

| File | For |
|---|---|
| `examples/uk-grad-swe.toml` | UK CS graduate, software engineering roles (same as `config.example.toml`) |
| `examples/uk-data-analyst.toml` | UK graduate, data/analyst roles |
| `examples/denmark.toml` | The upstream Danish portals (jobindex, jobnet, jobdanmark, jobbank) instead of the UK ones |

Copy whichever fits (or `config.example.toml`) to `config.toml` to start from it.

Validate a config and see exactly what would run, without any subprocess or network call:

```powershell
py job_scraper/daily_scrape.py --dry-run
py job_scraper/daily_scrape.py --dry-run --config examples/denmark.toml
```

`--config PATH` points the runner at any config file; omit it to use `config.toml` at the repo
root. Running with no `config.toml` present and no `--config` given exits with a message
telling you to copy the example.

## 6. Run it

```powershell
py job_scraper/daily_scrape.py
```

Writes `job_scraper/reports/YYYY-MM-DD.md`. Deduplicates against `job_scraper/seen_jobs.json`,
which it creates on first run — expect a big first report and much shorter ones after.

Optionally point it at a tracker spreadsheet to also skip roles you've already applied to,
either via the `tracker` setting in `config.toml` or the `JOBSEARCH_TRACKER` environment
variable (the env var takes priority, for people who prefer it over editing the config file):

```powershell
[Environment]::SetEnvironmentVariable("JOBSEARCH_TRACKER", "C:\path\to\your_tracker.xlsx", "User")
```

Leave both unset and the tracker dedupe is simply skipped.

Then each morning, open Claude Code in the repo and say **"review today's scrape report"**.

## 7. Schedule it (Windows)

```powershell
Start-Process powershell -Verb RunAs -ArgumentList "-File job_scraper\register_task.ps1"
```

It has to go through `Start-Process -Verb RunAs` with a `-File` script. Calling `schtasks`
directly from an agent shell gets Access Denied, and passing the arguments inline mangles the
quoting.

---

## Portal quirks — the things that cost us time

**Reed**
- No server-side date filter. `--jobage` filters client-side after fetching, so use a wider
  window than you want and let the dedupe handle repeats.
- Dates arrive as `DD/MM/YYYY`; the CLI normalises them to ISO.
- The `--graduate` flag pulls in non-technical grad schemes — treasury, finance, analyst roles.
  Filter at the review step or tighten the query.

**Gradcracker**
- `robots.txt` disallows `/keyword-search` but allows `/search/*`, so scheduled runs use
  discipline-browse mode only: `--discipline computing-technology --type graduate-jobs`.
  Don't switch it to keyword search for automated runs.
- Publishes application deadlines, not posting dates — `date` is always null. New listings
  surface through the dedupe, not through date sorting.
- Personal use only.

**Prospects**
- Uses the site's own public JSON endpoint (`GET /api/jobs`), which is robots-allowed.
- The query parameter is `keyword`, **singular**. `keywords` silently returns everything.
- Pages are 0-indexed, `sortBy=dp` is newest-first, and a page size below 5 can 500 on you.
- No posting dates here either. Board is around 250 live postings.

**All sources**
- There's a 1.5s sleep between queries. Leave it there.
- Titles are filtered by a **blocklist** (`SENIOR_WORDS` — senior, lead, principal, staff,
  head of, manager, director, architect, chief) rather than a junior-only allowlist. That's
  deliberate: an allowlist drops perfectly applicable roles that just don't say "junior".

## Sources that waste your time

These turn up in scrapes constantly and are worth recognising on sight:

| Source | What it actually is |
|---|---|
| **Haystack** | anonymous marketplace listings, no named employer |
| **Sundayy** | reposts other firms' jobs with mislabelled titles — a "Software Engineer" turned out to be a 10+ year Lead role |
| **Helic & Co** | CV harvesting, not real vacancies |
| **Hired**, **DiverseJobsMatter**, **Manchester Digital** | aggregators; the same role reposted under a different banner |
| **Jack & Jill** | proxy listings on behalf of unnamed startups — verify the actual employer before applying |

**Always open the link before you write anything.** AI tools will happily invent plausible
listings, and aggregators mislabel real ones. Confirm the role exists on the employer's own
careers page or ATS first.

## If you compile your CV with pdflatex

An en-dash (`--`) in a date range extracts from the PDF text layer as `0xAD`, a soft hyphen.
ATS date parsers choke on it. Use an em-dash (`---`) for date ranges instead. Check what a
parser actually sees with:

```powershell
pdftotext -layout your_cv.pdf - | Select-String "20\d\d"
```

Keep the CV to one page and confirm the page count on the compiled PDF, not in the source —
LaTeX page-break decisions aren't predictable from the `.tex`.

---

*Framework by Mads Lorentzen (see the upstream repo's LICENSE). This kit is the UK sources and
the daily runner only.*
