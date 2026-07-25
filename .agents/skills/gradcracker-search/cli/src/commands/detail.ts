import { BASE, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Build a fetchable detail URL from what the user passed.
 *
 * Accepted inputs:
 *   - full opportunity URL:  https://www.gradcracker.com/hub/1088/cambridge-consultants/graduate-job/81498/...
 *   - composite id from search results:  "1088-81498"  (<hubId>-<jobId>)
 *
 * A bare numeric job id is NOT resolvable: Gradcracker's job routes require the
 * correct hub (employer) id — wrong hub ids redirect to the employer hub page,
 * not the job. Slug and opportunity-type segments are cosmetic (the site 301s
 * them to canonical), so composite ids fetch via a placeholder slug/type.
 */
export function buildDetailUrl(input: string): string | null {
  const url = input.match(
    /^https:\/\/www\.gradcracker\.com\/hub\/\d+\/[^\/]+\/(?:graduate-job|work-placement-internship|degree-apprenticeship)\/\d+(?:\/[^?#]*)?/,
  )
  if (url) return url[0]
  const composite = input.match(/^(\d+)-(\d+)$/)
  if (composite) return `${BASE}/hub/${composite[1]}/x/graduate-job/${composite[2]}/x`
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const fetchUrl = buildDetailUrl(opts.id.trim())
  if (!fetchUrl) {
    writeError(
      `Could not parse "${opts.id}". Pass either the composite id from search results ` +
        `(e.g. "1088-81498") or a full gradcracker.com opportunity URL. A bare job number ` +
        `is not enough — Gradcracker URLs also need the employer's hub id.`,
      "BAD_ID",
    )
    return 1
  }

  try {
    const { html, url } = await htmlFetch(fetchUrl)
    // Wrong ids don't 404 — they 302 to the employer hub or /directory, which
    // lack the opportunity <h1 itemprop="title"> marker.
    if (!html || !/itemprop="title"/i.test(html)) {
      writeError("Job not found (id may be wrong, or the posting was removed)", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, url)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.deadline ? `Deadline: ${job.deadline}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.degreeRequired ? `Degree required: ${job.degreeRequired}` : "",
        job.starting ? `Starting: ${job.starting}` : "",
        job.type ? `Type: ${job.type}` : "",
        job.disciplines ? `Disciplines: ${job.disciplines}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
