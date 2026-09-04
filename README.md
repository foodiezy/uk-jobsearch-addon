# UK job search toolkit

Reusable UK job discovery tools for the
[`MadsLorentzen/ai-job-search`](https://github.com/MadsLorentzen/ai-job-search) framework.
This add-on provides Reed, Gradcracker, and Prospects search clients plus a configurable daily
runner that combines results into one report.

The toolkit is role-agnostic. Job titles, sectors, seniority, locations, exclusions, and tracker
settings live in a private local config file rather than in the repository.

## Do I need an AI coding assistant?

**No.** You do not need Codex, Claude Code, Gemini CLI, or another AI coding tool to install or
run this toolkit. It is a normal local program that runs from PowerShell.

An AI assistant is optional. It can help you edit search terms or understand an error, but the
instructions below are designed to work without one.

## What this toolkit does

After setup, one command searches the configured UK job sources and creates a dated report on
your computer:

```text
job_scraper/reports/2026-09-04.md
```

It does not apply for jobs, upload your CV, or send your information to employers. You review the
results and decide what to do with them.

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

## Beginner setup for Windows

Allow about 15 minutes. You only need to do this section once.

### Step 1: install the three required programs

Install:

1. [Git for Windows](https://git-scm.com/download/win)
2. [Python 3.11 or newer](https://www.python.org/downloads/windows/)
3. [Bun](https://bun.sh/docs/installation)

During the Python installation, tick **Add Python to PATH** if that option appears.

Restart PowerShell after installing them. Open PowerShell from the Windows Start menu and check
that all three are available:

```powershell
git --version
py --version
bun --version
```

Each command should print a version number. If one says that the command was not recognised,
restart the computer and try again before continuing.

### Step 2: download the framework and this add-on

Copy the entire block below, paste it into PowerShell, and press Enter:

```powershell
Set-Location "$env:USERPROFILE\Documents"
git clone https://github.com/MadsLorentzen/ai-job-search.git
git clone https://github.com/foodiezy/uk-jobsearch-addon.git

Copy-Item -Recurse -Force ".\uk-jobsearch-addon\.agents" ".\ai-job-search\"
Copy-Item -Recurse -Force ".\uk-jobsearch-addon\examples" ".\ai-job-search\"
Copy-Item -Recurse -Force ".\uk-jobsearch-addon\job_scraper" ".\ai-job-search\"
Copy-Item -Force ".\uk-jobsearch-addon\config.example.toml" ".\ai-job-search\config.example.toml"

Set-Location ".\ai-job-search"
```

This creates `Documents\ai-job-search`, which is the folder you will use from now on. The
separate `Documents\uk-jobsearch-addon` folder is only the downloaded add-on source and can be
left alone.

If PowerShell says that `ai-job-search` already exists, do not delete it if it contains your
information. Open that folder and follow its `SETUP.md`, or ask someone to help merge the add-on
safely.

### Step 3: install the job-source packages

Run this block from the `ai-job-search` folder:

```powershell
Set-Location ".agents\skills\reed-search\cli"
bun install
Set-Location "..\..\gradcracker-search\cli"
bun install
Set-Location "..\..\prospects-search\cli"
bun install
Set-Location "..\..\..\.."
```

### Step 4: create your private search settings

Run:

```powershell
Copy-Item config.example.toml config.toml
notepad config.toml
```

Notepad will open. Find the lines containing sample searches such as `project coordinator`,
`customer service advisor`, `marketing`, and `finance`. Replace those phrases with the jobs you
want. You can also change or add a location inside a query's `args` list.

Save the file and close Notepad. `config.toml` is private and ignored by Git, so personal search
settings are not published to this repository.

### Step 5: add Reed jobs (optional)

Gradcracker and Prospects can run without an API key. Reed requires a free key.

1. Register at [Reed's developer page](https://www.reed.co.uk/developers/jobseeker).
2. Copy the API key Reed gives you.
3. Replace `paste-your-key-here` below and run the command in PowerShell:

```powershell
[Environment]::SetEnvironmentVariable("REED_API_KEY", "paste-your-key-here", "User")
```

Close PowerShell and open it again after saving the key. Never put the key in `config.toml`, a
GitHub issue, a screenshot, or a message to somebody else.

If you do not want Reed results, remove or comment out the Reed `[[queries]]` blocks in
`config.toml`. The other sources will still work.

### Step 6: check the setup

Return to the project folder and perform a dry run. A dry run checks the configuration without
searching the internet:

```powershell
Set-Location "$env:USERPROFILE\Documents\ai-job-search"
py job_scraper\daily_scrape.py --dry-run
```

If it finishes without an error, run the real search:

```powershell
py job_scraper\daily_scrape.py
```

Open `Documents\ai-job-search\job_scraper\reports`. The newest Markdown file contains the
results. Markdown files can be opened in Notepad, Visual Studio Code, or a web-based Markdown
viewer.

### Optional: ask an AI coding assistant to set it up

If you already use Codex, Claude Code, or a similar tool, open it in the downloaded
`uk-jobsearch-addon` folder and use this prompt:

> Read README.md completely. Set this add-on up with the MadsLorentzen/ai-job-search framework
> on Windows. Do not add personal information or API keys to tracked files. Stop and ask me only
> when you need my Reed API key or my preferred job titles and locations. Run the dry-run check
> when setup is complete.

## Configuration reference

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

## Reed API key reference

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

Scheduling is optional. Run searches manually until you are happy with the results and search
terms.

## Common problems

### `git`, `py`, or `bun` is not recognised

Close PowerShell, restart the computer, and rerun the three version checks from Step 1. If only
Python fails, try `python --version`. If that works, replace `py` with `python` in the commands.

### `REED_API_KEY` is missing

Complete Step 5, then close and reopen PowerShell. Alternatively, remove Reed queries from
`config.toml` and use the other sources.

### The report contains no jobs

Try a broader job title, remove a location temporarily, and increase the query's `--limit`. Also
check the original job sites because a source may have no matching vacancies that day.

### A result has expired or has the wrong seniority

Search feeds can be stale or imperfect. Always open the employer's original vacancy before
preparing an application. The report is a discovery tool, not proof that a vacancy is still open.

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
