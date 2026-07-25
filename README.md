# UK job search add-on kit

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
| **Python** | `daily_scrape.py` | on Windows call it as `py`, not `python` — the Microsoft Store alias is a broken stub |
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

Also update `.claude/skills/job-scraper/search-queries.md` and the `QUERIES` list at the top of
`daily_scrape.py` so they agree with each other.

## 5. Run it

```powershell
py job_scraper/daily_scrape.py
```

Writes `job_scraper/reports/YYYY-MM-DD.md`. Deduplicates against `job_scraper/seen_jobs.json`,
which it creates on first run — expect a big first report and much shorter ones after.

Optionally point it at a tracker spreadsheet to also skip roles you've already applied to:

```powershell
[Environment]::SetEnvironmentVariable("JOBSEARCH_TRACKER", "C:\path\to\your_tracker.xlsx", "User")
```

Leave it unset and the tracker dedupe is simply skipped.

Then each morning, open Claude Code in the repo and say **"review today's scrape report"**.

## 6. Schedule it (Windows)

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
