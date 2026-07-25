import {
  BASE,
  htmlFetch,
  parseJobCards,
  parseTotal,
  writeError,
  type JobCard,
} from "../helpers.js"

export type OpportunityType = "all" | "graduate-jobs" | "placements" | "apprenticeships"

export interface SearchOpts {
  query?: string
  discipline: string
  type: OpportunityType
  location?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/** UK regions Gradcracker's browse facets support (slug form). */
export const REGIONS = [
  "channel-islands",
  "east-anglia",
  "east-midlands",
  "europe",
  "london-and-south-east",
  "north-east",
  "north-wales",
  "north-west",
  "northern-ireland",
  "republic-of-ireland",
  "scotland",
  "south-wales",
  "south-west",
  "west-midlands",
  "yorkshire",
] as const

const REGION_ALIASES: Record<string, string> = {
  london: "london-and-south-east",
  "south-east": "london-and-south-east",
  ireland: "republic-of-ireland",
}

export function regionSlug(location: string): string | null {
  const slug = location.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/&/g, "and")
  const resolved = REGION_ALIASES[slug] ?? slug
  return (REGIONS as readonly string[]).includes(resolved) ? resolved : null
}

/** Map --type to the browse-facet slug. */
function browseFacet(type: OpportunityType): string {
  switch (type) {
    case "graduate-jobs":
      return "graduate-jobs"
    case "placements":
      return "work-placements-internships"
    case "apprenticeships":
      return "degree-apprenticeships"
    default:
      return "engineering-jobs" // Gradcracker's "all opportunity types" facet
  }
}

export function buildUrl(opts: SearchOpts): string {
  if (opts.query) {
    // Keyword search (site-wide). NOTE: /keyword-search is disallowed by
    // robots.txt — personal, low-volume use only (see SKILL.md).
    const params = new URLSearchParams()
    params.set("query", opts.query)
    if (opts.type === "all" || opts.type === "graduate-jobs") params.set("jobs", "1")
    if (opts.type === "all" || opts.type === "placements") params.set("placements", "1")
    if (opts.type === "all" || opts.type === "apprenticeships")
      params.set("degree-apprenticeships", "1")
    if (opts.page > 1) params.set("page", String(opts.page))
    return `${BASE}/keyword-search?${params.toString()}`
  }
  let facet = browseFacet(opts.type)
  if (opts.location) {
    const slug = regionSlug(opts.location)
    if (slug) facet += `-in-${slug}`
  }
  const page = opts.page > 1 ? `?page=${opts.page}` : ""
  return `${BASE}/search/${opts.discipline}/${facet}${page}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 46).padEnd(46)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const deadline = c.deadline || "—"
    return `${c.id.padEnd(12)} ${title} ${company} ${loc} ${deadline}`
  })
  const header =
    "ID".padEnd(12) +
    " " +
    "TITLE".padEnd(46) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(22) +
    " DEADLINE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  // Validate before any network I/O.
  if (opts.query && opts.location) {
    writeError(
      "Gradcracker's keyword search has no location parameter. Either include the place " +
        'in --query (e.g. -q "software engineer london"), or drop --query and browse by ' +
        "discipline with --location <UK region>.",
      "UNSUPPORTED_FLAG",
    )
    return 1
  }
  if (!opts.query && opts.location && !regionSlug(opts.location)) {
    writeError(
      `Unknown region "${opts.location}". Gradcracker filters by UK region, not city. ` +
        `Valid regions: ${REGIONS.join(", ")}.`,
      "BAD_LOCATION",
    )
    return 1
  }

  try {
    const { html } = await htmlFetch(buildUrl(opts))
    let cards = parseJobCards(html)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · deadline: ${c.deadline || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      const total = parseTotal(html)
      const meta: Record<string, number | null> = { count: cards.length, page: opts.page }
      if (total !== null) meta.total = total
      process.stdout.write(JSON.stringify({ meta, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
