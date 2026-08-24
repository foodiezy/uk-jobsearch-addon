import { describe, test, expect } from "bun:test";
import {
  parseReedDate,
  normalizeSearchResult,
  normalizeDetail,
  filterByAge,
  buildSearchUrl,
  normalizeId,
  htmlToText,
  RESULTS_PER_PAGE,
  type JobResult,
} from "../src/helpers";

describe("parseReedDate", () => {
  test("Reed's DD/MM/YYYY becomes ISO YYYY-MM-DD", () => {
    expect(parseReedDate("10/07/2026")).toBe("2026-07-10");
    expect(parseReedDate("1/3/2026")).toBe("2026-03-01");
  });

  test("ISO input passes through as YYYY-MM-DD", () => {
    expect(parseReedDate("2026-07-10T00:00:00Z")).toBe("2026-07-10");
  });

  test("null/empty/non-string → null", () => {
    expect(parseReedDate(null)).toBeNull();
    expect(parseReedDate("")).toBeNull();
    expect(parseReedDate(42)).toBeNull();
  });

  test("unparseable string passes through raw (no data loss)", () => {
    expect(parseReedDate("someday")).toBe("someday");
  });
});

describe("normalizeSearchResult", () => {
  const raw = {
    jobId: 55555555,
    employerName: "Acme Ltd",
    jobTitle: "Project Coordinator",
    locationName: "Bristol",
    minimumSalary: 28000,
    maximumSalary: 32000,
    currency: "GBP",
    expirationDate: "20/08/2026",
    date: "10/07/2026",
    jobDescription: "snippet...",
    applications: 25,
    jobUrl: "https://www.reed.co.uk/jobs/project-coordinator/55555555",
  };

  test("maps Reed field names to the portal-skill contract", () => {
    const r = normalizeSearchResult(raw)!;
    expect(r.id).toBe("55555555");
    expect(r.title).toBe("Project Coordinator");
    expect(r.company).toBe("Acme Ltd");
    expect(r.location).toBe("Bristol");
    expect(r.date).toBe("2026-07-10");
    expect(r.url).toBe("https://www.reed.co.uk/jobs/project-coordinator/55555555");
    expect(r.salaryMin).toBe(28000);
    expect(r.salaryMax).toBe(32000);
    expect(r.currency).toBe("GBP");
    expect(r.applications).toBe(25);
  });

  test("missing contract fields are null, never omitted", () => {
    const r = normalizeSearchResult({ jobId: 123456 })!;
    expect(r.id).toBe("123456");
    expect(r.title).toBeNull();
    expect(r.company).toBeNull();
    expect(r.location).toBeNull();
    expect(r.date).toBeNull();
    expect(r.url).toBe("https://www.reed.co.uk/jobs/123456"); // synthesized fallback
    expect(r.salaryMin).toBeNull();
    expect(r.currency).toBeNull();
  });

  test("a result without a jobId is dropped (returns null)", () => {
    expect(normalizeSearchResult({ jobTitle: "No id" })).toBeNull();
  });
});

describe("normalizeDetail", () => {
  test("maps datePosted/applicationCount and strips HTML description", () => {
    const d = normalizeDetail(
      {
        jobId: 777,
        jobTitle: "Operations Assistant",
        employerName: "Beta Plc",
        datePosted: "05/07/2026",
        applicationCount: 12,
        contractType: "Permanent",
        fullTime: true,
        jobDescription: "<p>Coordinate &amp; deliver.</p><ul><li>Planning</li><li>Reporting</li></ul>",
        externalUrl: "https://apply.example.com/777",
      },
      "777",
    );
    expect(d.date).toBe("2026-07-05");
    expect(d.applications).toBe(12);
    expect(d.contractType).toBe("Permanent");
    expect(d.fullTime).toBe(true);
    expect(d.description).toContain("Coordinate & deliver.");
    expect(d.description).toContain("- Planning");
    expect(d.description).not.toContain("<");
    expect(d.externalUrl).toBe("https://apply.example.com/777");
  });
});

describe("filterByAge (client-side --jobage)", () => {
  const mk = (id: string, date: string | null): JobResult => ({
    id, title: null, company: null, location: null, date,
    url: "", salaryMin: null, salaryMax: null, currency: null,
    expirationDate: null, applications: null,
  });
  const now = new Date("2026-07-12T12:00:00Z");

  test("keeps jobs within the window, drops older and undated ones", () => {
    const results = [
      mk("fresh", "2026-07-10"),
      mk("stale", "2026-06-01"),
      mk("undated", null),
    ];
    const kept = filterByAge(results, 7, now).map((r) => r.id);
    expect(kept).toEqual(["fresh"]);
  });

  test("days <= 0 disables the filter", () => {
    const results = [mk("a", "2020-01-01"), mk("b", null)];
    expect(filterByAge(results, 0, now)).toHaveLength(2);
  });
});

describe("buildSearchUrl", () => {
  test("maps flags to Reed's documented parameters", () => {
    const url = new URL(
      buildSearchUrl({ query: "project coordinator", location: "Bristol", distance: 30, graduate: true, page: 2 }),
    );
    expect(url.origin + url.pathname).toBe("https://www.reed.co.uk/api/1.0/search");
    expect(url.searchParams.get("keywords")).toBe("project coordinator");
    expect(url.searchParams.get("locationName")).toBe("Bristol");
    expect(url.searchParams.get("distanceFromLocation")).toBe("30");
    expect(url.searchParams.get("graduate")).toBe("true");
    expect(url.searchParams.get("resultsToTake")).toBe(String(RESULTS_PER_PAGE));
    expect(url.searchParams.get("resultsToSkip")).toBe(String(RESULTS_PER_PAGE));
  });

  test("page 1 skips 0; omitted flags are absent", () => {
    const url = new URL(buildSearchUrl({ page: 1 }));
    expect(url.searchParams.get("resultsToSkip")).toBe("0");
    expect(url.searchParams.has("keywords")).toBe(false);
    expect(url.searchParams.has("locationName")).toBe(false);
    expect(url.searchParams.has("graduate")).toBe(false);
    expect(url.searchParams.has("distanceFromLocation")).toBe(false);
  });
});

describe("normalizeId", () => {
  test("bare numeric id", () => {
    expect(normalizeId("55555555")).toBe("55555555");
  });
  test("reed.co.uk job URL", () => {
    expect(normalizeId("https://www.reed.co.uk/jobs/project-coordinator/55555555")).toBe("55555555");
    expect(normalizeId("https://www.reed.co.uk/jobs/project-coordinator/55555555?source=search")).toBe("55555555");
  });
  test("garbage → null", () => {
    expect(normalizeId("not-a-job")).toBeNull();
    expect(normalizeId("https://example.com/jobs/12345678")).toBeNull();
  });
});

describe("htmlToText", () => {
  test("decodes entities incl. &pound; and preserves paragraph breaks", () => {
    const text = htmlToText("<p>Salary up to &pound;30,000</p><p>Apply &quot;now&quot;</p>");
    expect(text).toBe('Salary up to £30,000\nApply "now"');
  });
});
