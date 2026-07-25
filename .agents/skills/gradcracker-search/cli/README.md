# gradcracker-cli

Zero-runtime-dependency CLI for searching [Gradcracker](https://www.gradcracker.com),
the UK graduate/STEM careers board. Runs on `bun` + `fetch` + regex parsing —
`bun install` only pulls dev types for `tsc`.

**Personal use only.** Gradcracker's robots.txt disallows the `/keyword-search`
path that the `--query` flag uses (discipline browse, the default mode, is
allowed). Keep volume low; no bulk or commercial collection.

## Setup

```bash
bun install        # dev types only (typescript, @types/bun)
bun run typecheck  # tsc --noEmit
bun run test       # bun test (includes 2 live smoke requests)
```

## Usage

```bash
# Keyword search, UK-wide
bun run src/cli.ts search -q "software engineer" --limit 10 --format table

# Browse computing/technology graduate jobs in a UK region
bun run src/cli.ts search -t graduate-jobs -l east-midlands --format table

# Full detail (id comes from search results: "<hubId>-<jobId>")
bun run src/cli.ts detail 1088-81498 --format plain
```

Run `bun run src/cli.ts` with no arguments for full flag reference.

## Contract

- Commands: `search`, `detail <id|url>`.
- JSON shape: `{ "meta": { "count", "page"[, "total"] }, "results": [...] }`;
  each result has `id`, `title`, `company`, `location`, `date`, `url` (never
  omitted; missing → `null`) plus Gradcracker extras `deadline`, `salary`,
  `type`, `disciplines`.
- `date` is **always `null`** — Gradcracker publishes deadlines, not posting
  dates (`deadline` carries them; `--jobage` is accepted but ignored).
- Errors: `{ "error", "code" }` JSON on **stderr**, exit code 1.
- Fetching: Firefox User-Agent (Chrome UAs get 403 from the WAF — see
  `../url-reference.md`), exponential backoff + jitter on 429/5xx (max 6
  retries), empty result on 404.
- Parsing: per-`<article>` chunking; a malformed card is skipped, not fatal.

See `../url-reference.md` for every endpoint, parameter, and HTML anchor.
