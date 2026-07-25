// Data source: Gradcracker (https://www.gradcracker.com), the UK STEM
// graduate-careers board. Public pages, no authentication.
//
// Two search surfaces:
//   1. Discipline browse:  GET /search/<discipline>/<facet>   (robots.txt: allowed)
//   2. Keyword search:     GET /keyword-search?query=...       (robots.txt: DISALLOWED)
// robots.txt disallows /keyword-search, /out, /campaign, /download. The --query
// flag uses /keyword-search anyway for personal, low-volume use — see SKILL.md
// for the personal-use-only warning. Everything else this CLI touches is allowed.
//
// All parsing is chunked regex over server-rendered HTML (Laravel Livewire app,
// but search/detail pages are fully server-rendered). Zero runtime dependencies.

export const BASE = "https://www.gradcracker.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

// NOTE: Gradcracker's WAF returns 403 for a *Chrome* User-Agent coming from a
// non-Chrome TLS fingerprint (spoof detection). A Firefox UA passes. If 403s
// reappear, try dropping the User-Agent header entirely (also passes).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0"

export interface FetchResult {
  html: string
  /** Final URL after redirects (Gradcracker 301s slug-less/wrong-slug URLs to canonical). */
  url: string
}

/** Fetch HTML with exponential backoff + jitter on 429/5xx. Returns html:"" on 404. */
export async function htmlFetch(url: string): Promise<FetchResult> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
    if (response.status === 404) return { html: "", url: response.url || url }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return { html: await response.text(), url: response.url || url }
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// Text utilities
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
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&pound;/g, "£")
    .replace(/&euro;/g, "€")
    .replace(/&plus;/g, "+")
    .replace(/&hellip;/g, "…")
    .replace(/&reg;/g, "®")
    .replace(/&trade;/g, "™")
    .replace(/&copy;/g, "©")
    .replace(/&bull;/g, "•")
    .replace(/&middot;/g, "·")
    .replace(/&deg;/g, "°")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** "August 2nd, 2026" -> "2026-08-02". Returns null when not a parseable date (e.g. "Ongoing"). */
export function toIsoDate(text: string): string | null {
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/)
  if (!m) return null
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  }
  const month = months[m[1].toLowerCase()]
  if (!month) return null
  const day = parseInt(m[2], 10)
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/**
 * Given the index of a `<div ...>` opening tag, return the inner HTML of that
 * div (balanced). Used for the detail description, whose nested markup defeats
 * a single lazy regex.
 */
export function balancedDivSpan(
  html: string,
  openTagIdx: number,
): { inner: string; end: number } | null {
  const openEnd = html.indexOf(">", openTagIdx)
  if (openEnd === -1) return null
  const re = /<div\b|<\/div>/gi
  re.lastIndex = openEnd + 1
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    depth += m[0].toLowerCase() === "</div>" ? -1 : 1
    if (depth === 0) {
      return { inner: html.slice(openEnd + 1, m.index), end: m.index + m[0].length }
    }
  }
  return null
}

export function balancedDiv(html: string, openTagIdx: number): string | null {
  return balancedDivSpan(html, openTagIdx)?.inner ?? null
}

/** Remove every balanced <div> block whose opening tag matches `openTagRe`. */
export function removeBalancedDivs(html: string, openTagRe: RegExp): string {
  let out = html
  for (let guard = 0; guard < 20; guard++) {
    const m = out.match(openTagRe)
    if (!m || m.index === undefined) break
    const span = balancedDivSpan(out, m.index)
    if (span === null) break
    out = out.slice(0, m.index) + out.slice(span.end)
  }
  return out
}

/** Remove embedded non-description widgets ("not-body-content" promos, feedback-pledge badge). */
export function removeNotBodyContent(html: string): string {
  let out = removeBalancedDivs(html, /<div\b[^>]*not-body-content[^>]*>/i)
  out = removeBalancedDivs(out, /<div\b[^>]*feedback-pledge[^>]*>/i)
  // Trailing content-checksum marker: <p class="hash">1e127e...</p>
  return out.replace(/<p class="hash">[0-9a-f]{32}<\/p>/gi, " ")
}

// ---------------------------------------------------------------------------
// Search-results parsing
// ---------------------------------------------------------------------------

export interface JobCard {
  /** Composite "<hubId>-<jobId>" — both parts are needed to rebuild a detail URL. */
  id: string
  title: string
  company: string | null
  location: string | null
  /** Always null: Gradcracker does not publish posting dates (only deadlines). */
  date: string | null
  /** Application deadline, ISO yyyy-mm-dd when parseable, else raw text (e.g. "Ongoing"). */
  deadline: string | null
  salary: string | null
  /** graduate-job | work-placement-internship | degree-apprenticeship */
  type: string | null
  disciplines: string | null
  url: string
}

const JOB_URL_RE =
  /https:\/\/www\.gradcracker\.com\/hub\/(\d+)\/([^\/"]+)\/(graduate-job|work-placement-internship|degree-apprenticeship)\/(\d+)\/[^"?]*/

function dlField(chunk: string, label: string): string | null {
  const m = chunk.match(
    new RegExp(`<dt>\\s*${label}\\s*</dt>\\s*<dd>([\\s\\S]*?)</dd>`, "i"),
  )
  return m ? clean(m[1]) || null : null
}

/**
 * Parse a results page (works for both /search/... and /keyword-search — the
 * job-card markup is identical). Splits on <article and parses each chunk
 * independently so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<article\b/i).slice(1)

  for (const chunk of chunks) {
    // Title anchor: href is a full opportunity URL and the tag carries
    // data-mk-label="Job Title". (The employer-logo link has no job segment;
    // the "View job" footer link has a different data-mk-label.)
    const a = chunk.match(
      /<a\s[^>]*href="(https:\/\/www\.gradcracker\.com\/hub\/(\d+)\/[^\/"]+\/(graduate-job|work-placement-internship|degree-apprenticeship)\/(\d+)\/[^"]*)"[^>]*data-mk-label="Job Title"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (!a) continue
    const [, rawUrl, hubId, type, jobId, rawTitle] = a
    const title = clean(rawTitle)
    if (!title) continue

    let company: string | null = null
    const aria = chunk.match(/aria-label="Apply for the [^"]*? opportunity with ([^"]+)"/i)
    if (aria) company = decodeHtmlEntities(aria[1]).trim() || null
    if (!company) {
      const alt = chunk.match(/<img\b[^>]*\balt="([^"]+)"/i)
      if (alt) company = decodeHtmlEntities(alt[1]).trim() || null
    }

    const deadlineMatch = chunk.match(/Deadline:?\s*([^<]+)</i)
    const deadlineRaw = deadlineMatch ? clean(deadlineMatch[1]) : null
    const disciplinesMatch = chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)

    results.push({
      id: `${hubId}-${jobId}`,
      title,
      company,
      location: dlField(chunk, "Location"),
      date: null,
      deadline: deadlineRaw ? toIsoDate(deadlineRaw) ?? deadlineRaw : null,
      salary: dlField(chunk, "Salary"),
      type,
      disciplines: disciplinesMatch ? clean(disciplinesMatch[1]).replace(/\.$/, "") || null : null,
      url: decodeHtmlEntities(rawUrl).split("?")[0],
    })
  }

  return results
}

/** Total result count if the page reports one ("174 results"). */
export function parseTotal(html: string): number | null {
  const m = html.match(/([\d,]+)\s+results?\b/i)
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null
}

// ---------------------------------------------------------------------------
// Detail parsing
// ---------------------------------------------------------------------------

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  deadline: string | null
  salary: string | null
  degreeRequired: string | null
  starting: string | null
  type: string | null
  disciplines: string | null
  description: string | null
  applyUrl: string | null
  url: string
}

/** Sidebar "Deadline / Salary / Degree required / Location / Starting" pairs. */
function sidebarField(html: string, label: string): string | null {
  const m = html.match(
    new RegExp(
      `<div[^>]*tw-text-employer-500[^>]*>\\s*${label}\\s*</div>([\\s\\S]*?)</li>`,
      "i",
    ),
  )
  return m ? clean(m[1]) || null : null
}

export function parseJobDetail(html: string, finalUrl: string): JobDetail {
  const urlMatch = finalUrl.match(JOB_URL_RE)
  const hubId = urlMatch ? urlMatch[1] : null
  const type = urlMatch ? urlMatch[3] : null
  const jobId = urlMatch ? urlMatch[4] : null

  const titleMatch = html.match(/<h1[^>]*itemprop="title"[^>]*>([\s\S]*?)<\/h1>/i)
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)"

  // Company from the <title> tag: "Job | Section | <Company> Hub | Gradcracker ..."
  let company: string | null = null
  const pageTitle = html.match(/<title>([^<]*)<\/title>/i)
  if (pageTitle) {
    const hub = pageTitle[1].match(/\|\s*([^|]+?)\s+Hub\s*\|/)
    if (hub) company = decodeHtmlEntities(hub[1]).trim() || null
  }
  if (!company && hubId) {
    const crumb = html.match(
      new RegExp(`href="https://www\\.gradcracker\\.com/hub/${hubId}/[^/"]+"[^>]*>([^<]+?)\\s+Hub<`, "i"),
    )
    if (crumb) company = decodeHtmlEntities(crumb[1]).trim() || null
  }

  // Disciplines subtitle: the <h2> immediately following the itemprop h1.
  let disciplines: string | null = null
  const sub = html.match(/itemprop="title"[^>]*>[\s\S]*?<\/h1>\s*<h2[^>]*>([\s\S]*?)<\/h2>/i)
  if (sub) disciplines = clean(sub[1]).replace(/\.$/, "") || null

  const deadlineRaw = sidebarField(html, "Deadline")

  // Description: balanced extraction of <div class="body-content">, minus
  // embedded "not-body-content" promo widgets (videos, employer plugs).
  let description: string | null = null
  const bodyIdx = html.search(/<div\b[^>]*class="body-content"[^>]*>/i)
  if (bodyIdx !== -1) {
    let inner = balancedDiv(html, bodyIdx)
    if (inner !== null) {
      inner = removeNotBodyContent(inner)
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<video\b[\s\S]*?<\/video>/gi, " ")
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "- ")
      description =
        decodeHtmlEntities(inner.replace(/<[^>]+>/g, ""))
          .split("\n")
          .map((l) => l.replace(/[ \t]+/g, " ").trim())
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim() || null
    }
  }

  // Apply link: /out/<hub>?jobID=...&u=<double-URL-encoded destination>&signature=...
  // We never fetch /out (robots-disallowed); we decode u= to the real employer URL.
  let applyUrl: string | null = null
  const out = html.match(/href="(https:\/\/www\.gradcracker\.com\/out\/[^"]+)"/i)
  if (out) {
    try {
      const u = new URL(decodeHtmlEntities(out[1])).searchParams.get("u")
      if (u) {
        let dest = decodeURIComponent(u)
        if (/%[0-9a-fA-F]{2}/.test(dest) && !/^https?:\/\//.test(dest)) {
          dest = decodeURIComponent(dest)
        }
        // u= is double-encoded in practice ("https%253A..."): decode until stable.
        for (let i = 0; i < 3 && /%[0-9a-fA-F]{2}/.test(dest); i++) {
          const next = decodeURIComponent(dest)
          if (next === dest) break
          dest = next
        }
        if (/^https?:\/\//.test(dest)) applyUrl = dest
      }
    } catch {
      applyUrl = null
    }
  }

  return {
    id: hubId && jobId ? `${hubId}-${jobId}` : "(unknown)",
    title,
    company,
    location: sidebarField(html, "Location"),
    date: null,
    deadline: deadlineRaw ? toIsoDate(deadlineRaw) ?? deadlineRaw : null,
    salary: sidebarField(html, "Salary"),
    degreeRequired: sidebarField(html, "Degree required"),
    starting: sidebarField(html, "Starting"),
    type,
    disciplines,
    description,
    applyUrl,
    url: finalUrl.split("?")[0],
  }
}
