// Data source: Prospects (https://www.prospects.ac.uk), the UK graduate
// careers service run by Jisc. Public JSON API, no authentication.
//
// The search page (/graduate-jobs?keywords=...) is a client-rendered AngularJS
// app; the underlying data endpoint is GET /api/jobs, which returns plain JSON
// and works with a normal fetch. robots.txt (checked 2026-07-17) disallows only
// /redirect/, /apply?id=* and /partials/ — /api/ and /graduate-jobs are
// allowed, and this CLI never touches the disallowed paths.
//
// Quirks discovered while reverse-engineering the app bundle (378.js/785.js):
//   - the filter param is `keyword` (singular). `keywords` (as in the page URL)
//     is silently ignored and returns the whole board.
//   - sortBy=dp sorts by date posted (newest first), sortBy=rl by relevance.
//   - `size` below ~5 can 500 (a featured-jobs insertion bug server-side), so
//     we always request at least 10 and slice client-side.
//   - pages are 0-indexed; past-the-end pages return an empty `jobs` array.
//   - facet params (location, typeOfJob, ...) from the UI are NOT honored on
//     bare /api/jobs calls — do not bother sending them.

export const BASE = "https://www.prospects.ac.uk"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

// The HTML pages 403 without a browser UA; /api/jobs currently answers any UA,
// but we send a Chrome UA anyway so both surfaces behave consistently.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"

/** Fetch JSON with exponential backoff + jitter on 429/5xx. */
export async function jsonFetch(url: string): Promise<unknown> {
  const maxRetries = 5
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      redirect: "follow",
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// API response shapes (only the fields we consume)
// ---------------------------------------------------------------------------

interface ApiText {
  tnr: number
  text: string
}

export interface ApiJob {
  id: number
  title: string
  employer: { name: string | null } | null
  salary: ApiText | null
  location: ApiText[] | null
  typeOfJob: ApiText | null
  /** Epoch millis, or null for continuous recruitment. */
  closingDate: number | null
  continuousRecruitment: boolean
  isNew: boolean
  isFeatured: boolean
  jobSlug: string | null
}

export interface ApiResponse {
  lastPage: boolean
  totalNumberOfJobs: number
  jobs: ApiJob[]
}

export function isApiResponse(v: unknown): v is ApiResponse {
  return typeof v === "object" && v !== null && Array.isArray((v as ApiResponse).jobs)
}

// ---------------------------------------------------------------------------
// Normalised job card (matches the shape the other portal CLIs emit)
// ---------------------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  /** Always null: Prospects does not publish posting dates (only closing dates). */
  date: string | null
  /** Application deadline, ISO yyyy-mm-dd, or "Ongoing" for continuous recruitment. */
  deadline: string | null
  salary: string | null
  /** "graduate job" | "graduate scheme" | "internship" | ... */
  type: string | null
  isNew: boolean
  url: string
}

function epochToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Join location facets; a posting tagged with every UK region is "UK-wide". */
export function joinLocations(locations: ApiText[] | null): string | null {
  if (!locations || locations.length === 0) return null
  const texts = locations.map((l) => l.text.trim()).filter(Boolean)
  if (texts.length === 0) return null
  if (texts.length >= 10) return "UK-wide"
  if (texts.length > 4) return texts.slice(0, 4).join(", ") + ` +${texts.length - 4} more`
  return texts.join(", ")
}

export function toJobCard(job: ApiJob): JobCard {
  // The slug is cosmetic: /graduate-jobs/<anything>-<id> 301s to the canonical
  // employer-profile job URL, id alone drives the lookup.
  const slug = job.jobSlug || "job"
  return {
    id: String(job.id),
    title: (job.title || "").trim(),
    company: job.employer?.name?.trim() || null,
    location: joinLocations(job.location),
    date: null,
    deadline:
      job.closingDate !== null
        ? epochToIso(job.closingDate)
        : job.continuousRecruitment
          ? "Ongoing"
          : null,
    salary: job.salary?.text?.trim() || null,
    type: job.typeOfJob?.text?.trim() || null,
    isNew: job.isNew === true,
    url: `${BASE}/graduate-jobs/${slug}-${job.id}`,
  }
}
