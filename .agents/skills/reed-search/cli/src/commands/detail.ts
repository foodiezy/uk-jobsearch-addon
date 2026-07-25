import {
  apiFetch,
  normalizeDetail,
  normalizeId,
  writeError,
  ApiError,
  DETAIL_URL,
} from "../helpers.js"

export interface DetailOpts {
  apiKey: string
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Reed job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const raw = await apiFetch(`${DETAIL_URL}/${id}`, opts.apiKey)
    if (raw === null || typeof raw !== "object") {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = normalizeDetail(raw as Record<string, unknown>, id)

    if (opts.format === "plain") {
      const salary =
        job.salaryMin !== null || job.salaryMax !== null
          ? `Salary: ${job.salaryMin ?? "?"}–${job.salaryMax ?? "?"} ${job.currency || ""}${job.salaryType ? ` (${job.salaryType})` : ""}`.trimEnd()
          : ""
      const lines = [
        job.title || "(untitled)",
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        salary,
        job.contractType ? `Contract: ${job.contractType}` : "",
        job.fullTime !== null ? `Full-time: ${job.fullTime}` : "",
        job.date ? `Posted: ${job.date}` : "",
        job.expirationDate ? `Expires: ${job.expirationDate}` : "",
        job.applications !== null ? `Applications: ${job.applications}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.externalUrl ? `Apply: ${job.externalUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    if (e instanceof ApiError) writeError(e.message, e.code)
    else writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
