#!/usr/bin/env bun
// Self-contained CLI for searching Gradcracker (https://www.gradcracker.com),
// the UK graduate/STEM careers board. No external CLI framework — runs anywhere
// `bun` is available with zero install beyond the repo clone.
//
// Personal use only. Gradcracker's robots.txt disallows its /keyword-search
// path (used by --query) and /out redirects (never fetched — the CLI decodes
// apply links locally). Keep volume low, no bulk collection. The discipline
// browse pages (default mode, no --query) are robots-allowed.

import { runSearch, type SearchOpts, type OpportunityType } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit", d: "discipline", t: "type" }
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

const HELP = `gradcracker-cli — search UK graduate/STEM jobs on Gradcracker

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>       Site-wide keyword search (e.g. "civil engineer").
                           Uses Gradcracker's /keyword-search — that path is
                           disallowed by robots.txt; personal, low-volume use only.
  --discipline, -d <slug>  Browse-mode discipline (no --query). Default:
                           all-disciplines. Options include aerospace, chemical-process,
                           civil-building, computing-technology, electronic-electrical,
                           mechanical-engineering, science-maths, ...
  --type, -t <type>        all (default) | graduate-jobs | placements | apprenticeships.
                           Works in both modes.
  --location, -l <region>  Browse mode only: UK region facet (e.g. "east-midlands",
                           "london", "scotland", "north-west"). Cities are not
                           supported by the site. With --query, put the place in
                           the query text instead.
  --jobage <days>          NOT SUPPORTED by Gradcracker (no posting dates are
                           published, only application deadlines). Accepted and
                           ignored for cross-portal compatibility.
  --page <n>               1-indexed page. Default 1.
  --limit, -n <n>          Cap results emitted (client-side).
  --format <fmt>           json (default) | table | plain.

DETAIL
  <id|url>                 Composite id from search results ("1088-81498") or a
                           full gradcracker.com opportunity URL.

EXAMPLES
  bun run src/cli.ts search -q "civil engineer" --limit 10 --format table
  bun run src/cli.ts search -d all-disciplines -t graduate-jobs -l east-midlands --format table
  bun run src/cli.ts search -d science-maths -t placements --format json
  bun run src/cli.ts detail 1088-81498 --format plain

Personal use only — keep volume low. Results carry deadlines, not posting dates.
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

    let page = 1
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      page = Math.max(1, v)
    }
    let limit: number | undefined
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }
    if (flags.jobage !== undefined) {
      // Accepted for cross-portal compatibility; Gradcracker has no posting-age
      // parameter and publishes no posting dates, so this cannot be honored.
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
    }

    const type = typeof flags.type === "string" ? flags.type : "all"
    if (!["all", "graduate-jobs", "placements", "apprenticeships"].includes(type)) {
      process.stderr.write(
        JSON.stringify({
          error: `--type must be one of: all, graduate-jobs, placements, apprenticeships (got "${type}")`,
          code: "BAD_ARG",
        }) + "\n",
      )
      return 1
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      discipline:
        typeof flags.discipline === "string"
          ? flags.discipline.toLowerCase().trim().replace(/\s+/g, "-")
          : "all-disciplines",
      type: type as OpportunityType,
      location: typeof flags.location === "string" ? flags.location : undefined,
      page,
      limit,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main().then((code) => process.exit(code))
