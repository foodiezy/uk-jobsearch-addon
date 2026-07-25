import {
  BASE,
  isApiResponse,
  jsonFetch,
  toJobCard,
  writeError,
  type JobCard,
} from "../helpers.js"

export type SortMode = "dp" | "rl"

export interface SearchOpts {
  query: string
  sort: SortMode
  /** 1-indexed (API is 0-indexed; buildUrl converts). */
  page: number
  limit: number
  format: "json" | "table" | "plain"
}

/**
 * size below ~5 can 500 server-side (featured-jobs insertion bug), so always
 * request at least 10 and slice client-side. 40 per page keeps volume low
 * while covering the whole board for typical keywords (10-30 results).
 */
export function requestSize(limit: number): number {
  return Math.min(Math.max(limit, 10), 40)
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("keyword", opts.query) // singular! `keywords` is ignored by the API
  params.set("sortBy", opts.sort)
  params.set("size", String(requestSize(opts.limit)))
  params.set("page", String(opts.page - 1))
  return `${BASE}/api/jobs?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const deadline = c.deadline || "—"
    return `${c.id.padEnd(9)} ${title} ${company} ${loc} ${deadline}`
  })
  const header =
    "ID".padEnd(9) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(20) +
    " DEADLINE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const data = await jsonFetch(buildUrl(opts))
    if (!isApiResponse(data)) {
      writeError("Unexpected /api/jobs response shape (site API may have changed)", "BAD_RESPONSE")
      return 1
    }
    let cards = data.jobs.map(toJobCard)
    if (opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.type || "—"} · deadline: ${c.deadline || "—"}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      const meta = {
        count: cards.length,
        page: opts.page,
        total: data.totalNumberOfJobs,
        lastPage: data.lastPage,
      }
      process.stdout.write(JSON.stringify({ meta, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
