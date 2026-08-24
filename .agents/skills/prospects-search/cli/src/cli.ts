#!/usr/bin/env bun
// Self-contained CLI for searching Prospects (https://www.prospects.ac.uk),
// the UK graduate careers service run by Jisc. No external CLI framework —
// runs anywhere `bun` is available with zero install beyond the repo clone.
//
// Uses the site's own public JSON endpoint (GET /api/jobs) — the same one the
// /graduate-jobs search page calls. robots.txt allows /api/ and /graduate-jobs;
// the disallowed paths (/redirect/, /apply?id=*, /partials/) are never fetched.
// Personal use only. Keep volume low, no bulk collection.

import { runSearch, type SearchOpts, type SortMode } from "./commands/search.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit", s: "sort" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `prospects-cli — search UK graduate jobs on Prospects.ac.uk

USAGE
  bun run src/cli.ts search -q <keywords> [flags]

SEARCH FLAGS
  --query, -q <text>    Keyword search (required), e.g. "marketing".
                        Prospects lists graduate jobs/schemes and internships
                        only — no need to add "graduate" to the query.
  --sort, -s <mode>     dp (date posted, newest first — default) | rl (relevance).
  --page <n>            1-indexed page. Default 1.
  --limit, -n <n>       Cap results emitted (client-side). Default 20, max 40/page.
  --jobage <days>       NOT SUPPORTED by Prospects (no posting dates are
                        published, only closing dates). Accepted and ignored
                        for cross-portal compatibility; results carry an
                        "isNew" flag instead.
  --location <x>        NOT SUPPORTED server-side (the API ignores facet
                        params). Accepted and ignored; filter downstream.
  --format <fmt>        json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "marketing" --limit 20 --format table
  bun run src/cli.ts search -q "human resources" --format json
  bun run src/cli.ts search -q "finance" --sort rl --limit 10

Personal use only — keep volume low. Results carry closing dates, not posting dates.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
        )
        return null
      }
      return val
    }

    const query = typeof flags.query === "string" ? flags.query.trim() : ""
    if (!query) {
      process.stderr.write(
        JSON.stringify({ error: "search requires --query/-q <keywords>", code: "NO_QUERY" }) + "\n",
      )
      return 1
    }

    let page = 1
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      page = Math.max(1, v)
    }
    let limit = 20
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }
    if (flags.jobage !== undefined) {
      // Accepted for cross-portal compatibility; Prospects publishes no
      // posting dates, so age filtering cannot be honored.
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
    }

    const sort = typeof flags.sort === "string" ? flags.sort : "dp"
    if (!["dp", "rl"].includes(sort)) {
      process.stderr.write(
        JSON.stringify({ error: `--sort must be dp or rl (got "${sort}")`, code: "BAD_ARG" }) + "\n",
      )
      return 1
    }

    const opts: SearchOpts = {
      query,
      sort: sort as SortMode,
      page,
      limit,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main().then((code) => process.exit(code))
