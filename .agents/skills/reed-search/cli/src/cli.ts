#!/usr/bin/env bun
// Self-contained CLI for searching UK jobs via Reed.co.uk's OFFICIAL Jobseeker API.
// Zero runtime dependencies — runs anywhere `bun` is available.
//
// Requires a free API key from https://www.reed.co.uk/developers/jobseeker,
// read from the REED_API_KEY environment variable (HTTP Basic auth: key as
// username, empty password).

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { getApiKey, writeError, NO_API_KEY_MESSAGE } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const ALIASES: Record<string, string> = { q: "query", l: "location", n: "limit", h: "help" }

// Boolean flags never consume the next argv token.
const BOOLEAN_FLAGS = new Set(["graduate", "help"])

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "distance", "graduate", "jobage", "page", "limit", "format", "help"]),
  detail: new Set(["format", "help"]),
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = ALIASES[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (BOOLEAN_FLAGS.has(key) || next === undefined || (next.startsWith("-") && !/^-\d/.test(next))) {
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

const HELP = `reed-cli — search UK jobs via Reed.co.uk's official Jobseeker API

SETUP
  Requires a free API key: https://www.reed.co.uk/developers/jobseeker
  Set it in the REED_API_KEY environment variable.

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <jobId|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, role).
  --location, -l <text>   Location name, e.g. "Bristol", "London".
  --distance <miles>      Radius from --location in miles (Reed default: 10).
  --graduate              Only graduate positions (Reed's graduate filter).
  --jobage <days>         Posted within N days (client-side filter — Reed's API
                          has no server-side date parameter).
  --page <n>              1-indexed page, 100 results per page. Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "project coordinator" -l "Bristol" --distance 30 --format table
  bun run src/cli.ts search -q "marketing" --graduate --jobage 7 --limit 10
  bun run src/cli.ts detail 55555555 --format plain
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd !== "search" && cmd !== "detail") {
    writeError(`Unknown command "${cmd}"`, "BAD_CMD")
    return 1
  }

  // Reject unknown flags before doing anything else.
  for (const key of Object.keys(flags)) {
    if (key === "_") continue
    if (!KNOWN_FLAGS[cmd].has(key)) {
      writeError(`Unknown flag "--${key}" for "${cmd}" (run with --help for usage)`, "BAD_FLAG")
      return 1
    }
  }

  const parseIntFlag = (name: string): number | null | undefined => {
    const raw = flags[name]
    if (raw === undefined) return undefined
    const val = parseInt(raw as string, 10)
    if (isNaN(val)) {
      writeError(`--${name} must be a number, got "${raw}"`, "BAD_ARG")
      return null
    }
    return val
  }

  if (cmd === "search") {
    const jobage = parseIntFlag("jobage")
    if (jobage === null) return 1
    const page = parseIntFlag("page")
    if (page === null) return 1
    const limit = parseIntFlag("limit")
    if (limit === null) return 1
    const distance = parseIntFlag("distance")
    if (distance === null) return 1

    const fmt = (flags.format as string) || "json"
    if (typeof flags.format === "string" && !["json", "table", "plain"].includes(fmt)) {
      writeError(`--format must be json, table, or plain, got "${fmt}"`, "BAD_ARG")
      return 1
    }

    const apiKey = getApiKey()
    if (!apiKey) {
      writeError(NO_API_KEY_MESSAGE, "NO_API_KEY")
      return 1
    }

    const opts: SearchOpts = {
      apiKey,
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      distance,
      graduate: flags.graduate === true,
      jobage,
      page: page !== undefined ? Math.max(1, page) : 1,
      limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  // detail
  const id = (flags._ as string[])[1]
  if (!id) {
    writeError("detail requires a <jobId|url>", "NO_ID")
    return 1
  }
  const fmt = (flags.format as string) || "json"
  const apiKey = getApiKey()
  if (!apiKey) {
    writeError(NO_API_KEY_MESSAGE, "NO_API_KEY")
    return 1
  }
  const opts: DetailOpts = {
    apiKey,
    id,
    format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
  }
  return runDetail(opts)
}

main().then((code) => process.exit(code))
