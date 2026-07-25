# Working in this repo

This is a job-hunt workspace: it finds job postings automatically, then helps the owner of the
repo apply to them. You are assisting one person with their own job search.

Read these before doing substantive work:
- `README.md` — setup, configuration, and the portal quirks
- `CLAUDE.md` — the candidate profile and application workflow (despite the name, it is plain
  markdown and applies to any assistant)
- `.claude/skills/job-application-assistant/` — the profile files, CV and cover letter
  templates, and the verification checklist

## What is code and what is judgement

`job_scraper/daily_scrape.py` and the portal CLIs under `.agents/skills/` find jobs by calling
real APIs. **Never invent, guess at, or "helpfully" fill in a job posting.** If a listing is
not in a scrape report or given to you by the user, it does not exist. A fabricated role costs
the user hours of work on an application that goes nowhere, and this repo is deliberately
structured so you never have to produce one.

Your job is rating, writing, and checking:
- assess fit against the profile before drafting anything, and say so if the fit is poor
- tailor the CV and cover letter to the specific posting
- verify every claim you write against the profile files

## Rules that matter more than they look

**Never fabricate anything on an application document.** No skills the profile does not list,
no invented achievements, no companies the user did not work for, no metrics you cannot source
from their own notes. A CV is a factual claim made to an employer. Leave a genuine gap visible
rather than papering over it — an honest gap is survivable, a discovered fabrication is not.

**Verify the listing is real before drafting.** Open the URL. Aggregators repost roles under
misleading titles, some "listings" are CV-harvesting exercises, and scraped data goes stale.
Check the employer's own careers page or applicant tracking system when anything looks off.

**Respect the job boards.** Some of these sources restrict automated access, and the CLIs are
written to stay inside those limits — see the portal quirks in `README.md`. Do not widen a
query into a mode a site disallows, and do not add scraping of a new site without checking its
`robots.txt` and terms first.

**Check compiled output, not source.** LaTeX page breaks are not predictable from the `.tex`
file. Read the generated PDF before telling the user a document is finished.

**Ask before sending anything outward.** Submitting an application, emailing a recruiter, or
posting to a profile is the user's decision, not yours. Draft it, show it, wait.

## Conventions

- Configuration lives in `config.toml` (gitignored). Never hardcode search terms, paths, or
  filters into `daily_scrape.py` — add them to the config schema instead.
- `config.toml`, `job_scraper/seen_jobs.json`, `job_scraper/reports/` and anything under
  `documents/` are the user's private data. Do not commit them.
- Python tests: `python -m unittest discover job_scraper/tests`. CLI tests: `bun run test` in
  each `cli/` directory. Tests that make live requests are skipped unless `RUN_LIVE_TESTS=1` —
  keep it that way, so CI never scrapes a third party.
