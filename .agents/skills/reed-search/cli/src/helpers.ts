// Data source: Reed.co.uk's OFFICIAL Jobseeker API (https://www.reed.co.uk/developers/jobseeker).
// Structured JSON — no HTML scraping. Requires a free API key, passed as the username
// of an HTTP Basic auth header (empty password). The CLI reads it from REED_API_KEY.

export const API_BASE = "https://www.reed.co.uk/api/1.0"
export const SEARCH_URL = `${API_BASE}/search`
export const DETAIL_URL = `${API_BASE}/jobs`
export const RESULTS_PER_PAGE = 100 // Reed's resultsToTake max (and our fixed page size)

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export function getApiKey(): string | null {
  const key = process.env.REED_API_KEY
  return key && key.trim() !== "" ? key.trim() : null
}

export const NO_API_KEY_MESSAGE =
  "REED_API_KEY environment variable not set. Get a free key at https://www.reed.co.uk/developers/jobseeker"

export class ApiError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

/**
 * GET a Reed API URL as JSON. Basic auth: API key as username, empty password.
 * Retries 429/5xx with exponential backoff + jitter (max 6 retries).
 * Returns null on 404. Throws ApiError with INVALID_API_KEY on 401.
 */
export async function apiFetch(url: string, apiKey: string): Promise<unknown | null> {
  const auth = "Basic " + Buffer.from(`${apiKey}:`).toString("base64")
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: auth,
        Accept: "application/json",
        "User-Agent": "reed-cli/1.0 (personal job search)",
      },
      redirect: "follow",
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new ApiError(`Request failed: ${response.status} ${response.statusText}`, "HTTP_ERROR")
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(
        "Reed rejected the API key (HTTP " +
          response.status +
          "). Check REED_API_KEY — get a free key at https://www.reed.co.uk/developers/jobseeker",
        "INVALID_API_KEY",
      )
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new ApiError(`Request failed: ${response.status} ${response.statusText}`, "HTTP_ERROR")
    }
    return response.json()
  }
  throw new ApiError("Request failed after max retries", "HTTP_ERROR")
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Portal-skill contract result (+ Reed salary extras). */
export interface JobResult {
  id: string
  title: string | null
  company: string | null
  location: string | null
  date: string | null // ISO YYYY-MM-DD when parseable
  url: string
  salaryMin: number | null
  salaryMax: number | null
  currency: string | null
  expirationDate: string | null
  applications: number | null
}

export interface JobDetail extends JobResult {
  description: string | null
  contractType: string | null
  fullTime: boolean | null
  partTime: boolean | null
  salaryType: string | null
  externalUrl: string | null
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null
}

/**
 * Reed returns dates as DD/MM/YYYY strings. Normalize to ISO YYYY-MM-DD.
 * Falls back to Date.parse for ISO-ish inputs, then to the raw string, so an
 * unexpected format degrades to passthrough rather than data loss.
 */
export function parseReedDate(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null
  const s = raw.trim()
  const uk = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (uk) {
    const [, d, m, y] = uk
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  return s // unknown format: pass through rather than drop
}

/** Normalize a raw Reed search result to the portal-skill contract shape. */
export function normalizeSearchResult(raw: Record<string, unknown>): JobResult | null {
  const jobId = num(raw.jobId) ?? (str(raw.jobId) ? Number(raw.jobId) : null)
  if (jobId === null || Number.isNaN(jobId)) return null
  const id = String(jobId)
  return {
    id,
    title: str(raw.jobTitle),
    company: str(raw.employerName),
    location: str(raw.locationName),
    date: parseReedDate(raw.date),
    url: str(raw.jobUrl) ?? `https://www.reed.co.uk/jobs/${id}`,
    salaryMin: num(raw.minimumSalary),
    salaryMax: num(raw.maximumSalary),
    currency: str(raw.currency),
    expirationDate: parseReedDate(raw.expirationDate),
    applications: num(raw.applications),
  }
}

/** Normalize a raw Reed detail response. */
export function normalizeDetail(raw: Record<string, unknown>, fallbackId: string): JobDetail {
  const base = normalizeSearchResult(raw) ?? {
    id: fallbackId,
    title: str(raw.jobTitle),
    company: str(raw.employerName),
    location: str(raw.locationName),
    date: null,
    url: str(raw.jobUrl) ?? `https://www.reed.co.uk/jobs/${fallbackId}`,
    salaryMin: num(raw.minimumSalary),
    salaryMax: num(raw.maximumSalary),
    currency: str(raw.currency),
    expirationDate: parseReedDate(raw.expirationDate),
    applications: null,
  }
  return {
    ...base,
    // Detail uses datePosted (search uses date) and applicationCount (search uses applications).
    date: base.date ?? parseReedDate(raw.datePosted),
    applications: base.applications ?? num(raw.applicationCount),
    description: str(raw.jobDescription) ? htmlToText(raw.jobDescription as string) : null,
    contractType: str(raw.contractType),
    fullTime: bool(raw.fullTime),
    partTime: bool(raw.partTime),
    salaryType: str(raw.salaryType),
    externalUrl: str(raw.externalUrl),
  }
}

/** Client-side posting-age filter (Reed has no server-side date parameter). */
export function filterByAge(results: JobResult[], days: number, now: Date = new Date()): JobResult[] {
  if (!days || days <= 0 || days >= 9999) return results
  const cutoff = now.getTime() - days * 86400_000
  return results.filter((r) => {
    if (!r.date) return false // undated jobs cannot be proven fresh
    const t = Date.parse(r.date)
    return !Number.isNaN(t) && t >= cutoff
  })
}

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

export interface SearchParams {
  query?: string
  location?: string
  distance?: number
  graduate?: boolean
  page: number // 1-indexed
}

export function buildSearchUrl(p: SearchParams): string {
  const params = new URLSearchParams()
  if (p.query) params.set("keywords", p.query)
  if (p.location) params.set("locationName", p.location)
  if (p.distance !== undefined) params.set("distanceFromLocation", String(p.distance))
  if (p.graduate) params.set("graduate", "true")
  params.set("resultsToTake", String(RESULTS_PER_PAGE))
  params.set("resultsToSkip", String((Math.max(1, p.page) - 1) * RESULTS_PER_PAGE))
  return `${SEARCH_URL}?${params.toString()}`
}

/** Accept a bare numeric job ID or a reed.co.uk job URL. */
export function normalizeId(input: string): string | null {
  const bare = input.match(/^\d{4,}$/)
  if (bare) return input
  if (/reed\.co\.uk/i.test(input)) {
    const m = input.match(/\/(\d{4,})(?:[/?#]|$)/)
    if (m) return m[1]
  }
  return null
}

// ---------------------------------------------------------------------------
// HTML → text (detail descriptions are HTML)
// ---------------------------------------------------------------------------

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&pound;/g, "£")
}

/** Strip tags but keep paragraph/list breaks as newlines, then decode entities. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
