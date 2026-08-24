# reed-cli

CLI for searching **UK jobs** via **Reed.co.uk's official Jobseeker API**.

**Data source**: `https://www.reed.co.uk/api/1.0/search` and `https://www.reed.co.uk/api/1.0/jobs/{jobId}` (official, structured JSON — no HTML scraping).
**Authentication**: free API key, HTTP Basic (key as username, empty password), read from the `REED_API_KEY` environment variable.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## API key setup (required)

1. Register for a free key at <https://www.reed.co.uk/developers/jobseeker>.
2. Set `REED_API_KEY`:

**Windows — persist for all future shells (PowerShell or cmd):**

```powershell
setx REED_API_KEY "your-key-here"
```

(`setx` does not affect the *current* shell — open a new terminal, or also run the per-session form below.)

**Windows — current PowerShell session only:**

```powershell
$env:REED_API_KEY = "your-key-here"
```

**bash / Git Bash:**

```bash
export REED_API_KEY="your-key-here"
```

Without the key, every command exits `1` with
`{"error":"REED_API_KEY environment variable not set. Get a free key at https://www.reed.co.uk/developers/jobseeker","code":"NO_API_KEY"}` on stderr.

## Installation

```bash
cd .agents/skills/reed-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search Reed job listings |
| `detail <jobId\|url>` | Fetch full detail (full description, contract type, salary) for one job |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.
A `401` from Reed maps to code `INVALID_API_KEY`.

## Quick examples

```bash
# Project coordinator roles near Bristol (30-mile radius)
bun run src/cli.ts search -q "project coordinator" -l "Bristol" --distance 30 --format table

# Marketing roles, Reed's graduate filter, posted in the last 7 days
bun run src/cli.ts search -q "marketing" --graduate --jobage 7 --limit 10

# Full detail for one job
bun run src/cli.ts detail 55555555 --format plain
```

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). Maps to Reed's `keywords`. |
| `--location` | `-l` | Location name (maps to `locationName`), e.g. `"Bristol"`, `"London"`. |
| `--distance` | | Miles from `--location` (maps to `distanceFromLocation`; Reed default 10). |
| `--graduate` | | Boolean — Reed's `graduate` positions filter. |
| `--jobage` | | Posted within N days. **Client-side** filter (Reed has no server-side date parameter); undated jobs are dropped when set. |
| `--page` | | 1-indexed page, 100 results per page (`resultsToSkip`/`resultsToTake`). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |

See `../SKILL.md` for the full reference and `../url-reference.md` for the API documentation.
