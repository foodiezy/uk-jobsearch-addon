# UK job search toolkit

Reusable UK job discovery tools for the
[`MadsLorentzen/ai-job-search`](https://github.com/MadsLorentzen/ai-job-search) framework.
This add-on provides Reed, Gradcracker, and Prospects search clients plus a configurable daily
runner that combines results into one report.

The toolkit is role-agnostic. Job titles, sectors, seniority, locations, exclusions, and tracker
settings live in a private local config file rather than in the repository.

## Privacy first

This repository intentionally contains no candidate profile, CV, contact details, search history,
application tracker, API key, or personalised search configuration.

The following local files are ignored by Git:

- `config.toml` — your search configuration
- `.env` files — local credentials
- `job_scraper/seen_jobs.json` and `job_scraper/reports/` — your search activity
- `documents/`, CVs, cover letters, PDFs, and spreadsheets — application material

Keep API keys in environment variables. Before publishing a fork, run `git status` and check every
file that will be committed.

## Install

Install the base framework first:

```bash
git clone https://github.com/MadsLorentzen/ai-job-search
cd ai-job-search
```

Follow its `SETUP.md`, then copy this add-on over the clone. It adds:

```text
.agents/skills/reed-search/
.agents/skills/gradcracker-search/
.agents/skills/prospects-search/
job_scraper/daily_scrape.py
job_scraper/register_task.ps1
```

Requirements:

- Python 3.11 or newer for the daily runner
- Bun for the TypeScript portal clients
- A free `REED_API_KEY` for Reed searches

Install each client’s packages from its `cli/` directory with `bun install`.

## Configure any kind of job search

Copy the public template to the private config file:

```powershell
Copy-Item config.example.toml config.toml
```

Edit the sample `[[queries]]` entries to use your own job titles and locations. No Python changes
are required.

```toml
[settings]
tracker = ""
tracker_company_column = 0
tracker_skip_rows = 1
polite_delay_seconds = 1.5
query_timeout_seconds = 120

[filters]
excluded_title_words = []
blocked_companies = []

[sources]
reed = ".agents/skills/reed-search/cli/src/cli.ts"

[[queries]]
label = "Reed project coordinator"
source = "reed"
args = ["search", "-q", "project coordinator", "--jobage", "7", "--limit", "25"]
```

`excluded_title_words` is optional. Leave it empty to search all seniority levels, or add words
such as `"director"` when you deliberately want to exclude those titles. `blocked_companies` is
also empty by default; each user should decide their own exclusions.

Ready-made, non-technical examples are included:

| File | Use case |
|---|---|
| `examples/uk-general.toml` | Mixed UK roles across operations, customer service, sales, and marketing |
| `examples/uk-graduate.toml` | Graduate opportunities across multiple sectors and disciplines |
| `examples/uk-experienced.toml` | Experienced professional and management roles |

Validate without making a network request:

```powershell
py job_scraper/daily_scrape.py --dry-run
py job_scraper/daily_scrape.py --dry-run --config examples/uk-general.toml
```

If an optional source from the upstream framework is not installed, its queries are skipped with
a warning rather than stopping the report.

## Reed API key

Register at <https://www.reed.co.uk/developers/jobseeker>, then store the key outside the repo:

```powershell
[Environment]::SetEnvironmentVariable("REED_API_KEY", "your-key-here", "User")
```

Open a new terminal after setting a persistent environment variable. Never paste a real key into
`config.toml`, source code, an issue, or a commit.

## Run and schedule

Run a search manually:

```powershell
py job_scraper/daily_scrape.py
```

The runner writes `job_scraper/reports/YYYY-MM-DD.md` and deduplicates against the private
`job_scraper/seen_jobs.json` file. A tracker spreadsheet is optional; set its path in `config.toml`
or with `JOBSEARCH_TRACKER`.

On Windows, register the daily task from an elevated PowerShell window:

```powershell
powershell -ExecutionPolicy Bypass -File job_scraper\register_task.ps1
```

The registration script uses the current repository path and accepts optional `-At` and
`-TaskName` parameters, so it does not contain a user-specific directory.

## Portal notes

### Reed

- Uses Reed’s official Jobseeker API and requires `REED_API_KEY`.
- `--jobage` filters the returned page client-side because the API has no posting-age parameter.
- `--location` accepts a UK place name and `--distance` sets the radius in miles.

### Gradcracker

- Covers STEM graduate jobs, placements, and degree apprenticeships across many disciplines.
- The default browse mode is `all-disciplines`, not computing.
- Scheduled searches should use browse mode because `robots.txt` disallows keyword search.
- Publishes application deadlines rather than posting dates. Keep use personal and low-volume.

### Prospects

- Covers graduate jobs, schemes, and internships across sectors.
- Uses the site’s public JSON endpoint and publishes closing dates rather than posting dates.
- Always verify a result on the employer’s own careers site before applying.

### All sources

- The runner waits between requests; keep the delay enabled.
- Search results can be stale or reposted. Open the original listing before preparing an
  application.
- Never let an assistant invent a vacancy or make unsupported claims in an application.

## Tests

```powershell
py -m unittest discover job_scraper/tests
```

Run `bun run test` inside each `.agents/skills/*/cli` directory. Tests that make live requests stay
disabled unless `RUN_LIVE_TESTS=1` is explicitly set.

---

Framework by Mads Lorentzen. See the upstream repository and this repository’s `LICENSE`.
