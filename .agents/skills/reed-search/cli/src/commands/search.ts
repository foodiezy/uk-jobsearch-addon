import {
  apiFetch,
  buildSearchUrl,
  filterByAge,
  normalizeSearchResult,
  writeError,
  ApiError,
  type JobResult,
} from "../helpers.js"

export interface SearchOpts {
  apiKey: string
  query?: string
  location?: string
  distance?: number
  graduate?: boolean
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const lines = rows.map((r) => {
    const title = (r.title || "—").slice(0, 42).padEnd(42)
    const company = (r.company || "—").slice(0, 26).padEnd(26)
    const loc = (r.location || "—").slice(0, 20).padEnd(20)
    const salary =
      r.salaryMin !== null || r.salaryMax !== null
        ? `${r.salaryMin ?? "?"}–${r.salaryMax ?? "?"}`
        : "—"
    return `${r.id.padEnd(10)} ${title} ${company} ${loc} ${(r.date || "—").padEnd(10)} ${salary}`
  })
  const header =
    "ID".padEnd(10) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(20) +
    " " +
    "DATE".padEnd(10) +
    " SALARY"
  return [header, "-".repeat(header.length), ...lines].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const url = buildSearchUrl({
      query: opts.query,
      location: opts.location,
      distance: opts.distance,
      graduate: opts.graduate,
      page: opts.page,
    })
    const data = (await apiFetch(url, opts.apiKey)) as {
      results?: unknown[]
      totalResults?: number
    } | null
    if (!data || !Array.isArray(data.results)) {
      writeError("Unexpected API response (no results array)", "BAD_RESPONSE")
      return 1
    }

    let results = data.results
      .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
      .map(normalizeSearchResult)
      .filter((r): r is JobResult => r !== null)

    if (opts.jobage !== undefined) results = filterByAge(results, opts.jobage)
    if (opts.limit !== undefined && opts.limit >= 0) results = results.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        results
          .map(
            (r) =>
              `${r.title || "(untitled)"}\n  ${r.company || "—"} · ${r.location || "—"} · ${r.date || "—"}` +
              (r.salaryMin !== null || r.salaryMax !== null
                ? ` · ${r.salaryMin ?? "?"}–${r.salaryMax ?? "?"} ${r.currency || ""}`.trimEnd()
                : "") +
              `\n  id: ${r.id}\n  ${r.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: results.length,
              page: opts.page,
              totalResults: typeof data.totalResults === "number" ? data.totalResults : null,
            },
            results,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    if (e instanceof ApiError) writeError(e.message, e.code)
    else writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
