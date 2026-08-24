# Working in this repository

This is reusable UK job-discovery tooling. It is not tied to a particular candidate, profession,
sector, seniority level, or location.

Read `README.md` before substantive work. Portal-specific behaviour and access restrictions are
documented in each `.agents/skills/*/SKILL.md` file.

## Privacy boundary

The tracked repository must contain only public code, documentation, tests, and generic examples.
Never commit a person’s name, contact details, home area, CV, cover letter, candidate profile,
application answers, job-search history, tracker, API key, or personalised query configuration.

Private data belongs only in ignored local files:

- `config.toml`
- `.env` files or environment variables
- `job_scraper/seen_jobs.json`
- `job_scraper/reports/`
- `documents/`, PDFs, and spreadsheets

If private data is needed for an application task, use only what the user explicitly provides,
keep it outside tracked files, and verify every factual claim. Ask before submitting an
application, sending a message, or changing an external account.

## Listing integrity

Never invent or fill gaps in a job posting. Only report roles returned by a configured source or
given directly by the user. Open the original employer or applicant-tracking-system page before
drafting application material because aggregators can mislabel or retain stale listings.

Respect each source’s terms and `robots.txt`. Do not add or widen automated scraping without first
checking the source’s rules. Live-request tests must remain opt-in through `RUN_LIVE_TESTS=1` so CI
does not scrape third-party sites.

## Conventions

- All search terms, locations, paths, filters, and exclusions belong in `config.toml`, never in
  `job_scraper/daily_scrape.py`.
- Public examples must cover varied, non-identifying roles and locations.
- The default configuration must not assume a technical career or entry-level seniority.
- Python tests: `python -m unittest discover job_scraper/tests`.
- CLI tests: `bun run test` in each `.agents/skills/*/cli` directory.
