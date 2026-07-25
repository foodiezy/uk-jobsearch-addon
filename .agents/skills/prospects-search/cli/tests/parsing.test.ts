// Offline unit tests for the pure helpers (no network).
import { describe, expect, test } from "bun:test";
import {
  isApiResponse,
  joinLocations,
  toJobCard,
  type ApiJob,
  type ApiResponse,
} from "../src/helpers";
import { buildUrl, requestSize, type SearchOpts } from "../src/commands/search";

function mkApiJob(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: 1,
    title: "Job",
    employer: null,
    salary: null,
    location: null,
    typeOfJob: null,
    closingDate: null,
    continuousRecruitment: false,
    isNew: false,
    isFeatured: false,
    jobSlug: null,
    ...overrides,
  };
}

describe("joinLocations", () => {
  test("null/empty → null", () => {
    expect(joinLocations(null)).toBeNull();
    expect(joinLocations([])).toBeNull();
  });

  test("blank-text facets are filtered out; all-blank → null", () => {
    expect(joinLocations([{ tnr: 1, text: "   " }])).toBeNull();
  });

  test("a handful of facets are joined with commas", () => {
    const locs = [
      { tnr: 1, text: "Nottingham" },
      { tnr: 2, text: "London" },
    ];
    expect(joinLocations(locs)).toBe("Nottingham, London");
  });

  test("exactly 4 facets are joined in full (no truncation)", () => {
    const locs = ["A", "B", "C", "D"].map((text, i) => ({ tnr: i, text }));
    expect(joinLocations(locs)).toBe("A, B, C, D");
  });

  test("more than 4 facets are truncated to 4 with a '+N more' suffix", () => {
    const locs = ["A", "B", "C", "D", "E"].map((text, i) => ({ tnr: i, text }));
    expect(joinLocations(locs)).toBe("A, B, C, D +1 more");
  });

  test("9 facets: still truncated (below the UK-wide threshold)", () => {
    const locs = Array.from({ length: 9 }, (_, i) => ({ tnr: i, text: `R${i}` }));
    expect(joinLocations(locs)).toBe("R0, R1, R2, R3 +5 more");
  });

  test("10 or more facets collapse to 'UK-wide'", () => {
    const locs = Array.from({ length: 10 }, (_, i) => ({ tnr: i, text: `R${i}` }));
    expect(joinLocations(locs)).toBe("UK-wide");
  });
});

describe("isApiResponse", () => {
  test("accepts a well-formed response", () => {
    expect(isApiResponse({ lastPage: false, totalNumberOfJobs: 3, jobs: [] })).toBe(true);
  });
  test("rejects non-objects and objects without a jobs array", () => {
    expect(isApiResponse(null)).toBe(false);
    expect(isApiResponse(undefined)).toBe(false);
    expect(isApiResponse("jobs")).toBe(false);
    expect(isApiResponse({})).toBe(false);
    expect(isApiResponse({ jobs: "not-an-array" })).toBe(false);
  });
});

describe("toJobCard (response normalisation into the common result shape)", () => {
  test("maps a fully-populated job", () => {
    const job = mkApiJob({
      id: 123,
      title: "  Graduate Software Engineer  ",
      employer: { name: " Acme Ltd " },
      salary: { tnr: 1, text: " £25,000 - £30,000 " },
      location: [
        { tnr: 1, text: "Nottingham" },
        { tnr: 2, text: "London" },
      ],
      typeOfJob: { tnr: 1, text: " graduate job " },
      closingDate: Date.UTC(2026, 7, 20), // 20 Aug 2026
      continuousRecruitment: false,
      isNew: true,
      jobSlug: "graduate-software-engineer",
    });
    const card = toJobCard(job);
    expect(card.id).toBe("123");
    expect(card.title).toBe("Graduate Software Engineer");
    expect(card.company).toBe("Acme Ltd");
    expect(card.location).toBe("Nottingham, London");
    expect(card.salary).toBe("£25,000 - £30,000");
    expect(card.type).toBe("graduate job");
    expect(card.deadline).toBe("2026-08-20");
    expect(card.isNew).toBe(true);
    expect(card.url).toBe(
      "https://www.prospects.ac.uk/graduate-jobs/graduate-software-engineer-123"
    );
  });

  test("date is always null — Prospects publishes no posting dates, only closing dates", () => {
    expect(toJobCard(mkApiJob({ closingDate: Date.UTC(2026, 0, 1) })).date).toBeNull();
    expect(toJobCard(mkApiJob({ closingDate: null })).date).toBeNull();
  });

  test("continuousRecruitment with no closingDate → deadline 'Ongoing'", () => {
    const card = toJobCard(mkApiJob({ closingDate: null, continuousRecruitment: true }));
    expect(card.deadline).toBe("Ongoing");
  });

  test("no closingDate and not continuous → deadline null", () => {
    const card = toJobCard(mkApiJob({ closingDate: null, continuousRecruitment: false }));
    expect(card.deadline).toBeNull();
  });

  test("missing employer/salary/typeOfJob/location → nulls, never omitted", () => {
    const card = toJobCard(mkApiJob({ id: 456 }));
    expect(card.company).toBeNull();
    expect(card.salary).toBeNull();
    expect(card.type).toBeNull();
    expect(card.location).toBeNull();
  });

  test("missing jobSlug falls back to 'job' in the synthesized URL", () => {
    const card = toJobCard(mkApiJob({ id: 999, jobSlug: null }));
    expect(card.url).toBe("https://www.prospects.ac.uk/graduate-jobs/job-999");
  });

  test("a full ApiResponse fixture maps to the results array runSearch would emit", () => {
    const response: ApiResponse = {
      lastPage: true,
      totalNumberOfJobs: 2,
      jobs: [
        mkApiJob({
          id: 1,
          title: "Junior Developer",
          employer: { name: "Beta Plc" },
          closingDate: null,
          continuousRecruitment: true,
          jobSlug: "junior-developer",
        }),
        mkApiJob({
          id: 2,
          title: "Data Analyst",
          employer: { name: "Gamma Inc" },
          location: Array.from({ length: 10 }, (_, i) => ({ tnr: i, text: `R${i}` })),
          closingDate: Date.UTC(2026, 8, 1),
          jobSlug: "data-analyst",
        }),
      ],
    };
    const cards = response.jobs.map(toJobCard);
    expect(cards).toHaveLength(2);
    expect(cards[0].deadline).toBe("Ongoing");
    expect(cards[0].date).toBeNull();
    expect(cards[1].location).toBe("UK-wide");
    expect(cards[1].deadline).toBe("2026-09-01");
    expect(cards[1].date).toBeNull();
  });
});

describe("requestSize (client-side floor/ceiling around the API's --size)", () => {
  test("clamps below 10 up to 10 — sizes under ~5 can 500 server-side", () => {
    expect(requestSize(0)).toBe(10);
    expect(requestSize(1)).toBe(10);
    expect(requestSize(9)).toBe(10);
  });
  test("passes values in [10, 40] through unchanged", () => {
    expect(requestSize(10)).toBe(10);
    expect(requestSize(20)).toBe(20);
    expect(requestSize(40)).toBe(40);
  });
  test("clamps above 40 down to 40", () => {
    expect(requestSize(41)).toBe(40);
    expect(requestSize(1000)).toBe(40);
  });
});

describe("buildUrl", () => {
  const base: SearchOpts = { query: "software engineer", sort: "dp", page: 1, limit: 20, format: "json" };

  test("uses the singular 'keyword' param — 'keywords' is silently ignored by the API", () => {
    const url = new URL(buildUrl(base));
    expect(url.origin + url.pathname).toBe("https://www.prospects.ac.uk/api/jobs");
    expect(url.searchParams.get("keyword")).toBe("software engineer");
    expect(url.searchParams.has("keywords")).toBe(false);
  });

  test("sortBy carries the mode straight through (dp = newest-first, rl = relevance)", () => {
    expect(new URL(buildUrl({ ...base, sort: "dp" })).searchParams.get("sortBy")).toBe("dp");
    expect(new URL(buildUrl({ ...base, sort: "rl" })).searchParams.get("sortBy")).toBe("rl");
  });

  test("page is converted from 1-indexed to the API's 0-indexed page", () => {
    expect(new URL(buildUrl({ ...base, page: 1 })).searchParams.get("page")).toBe("0");
    expect(new URL(buildUrl({ ...base, page: 2 })).searchParams.get("page")).toBe("1");
    expect(new URL(buildUrl({ ...base, page: 5 })).searchParams.get("page")).toBe("4");
  });

  test("size is derived from limit via requestSize, not sent raw", () => {
    expect(new URL(buildUrl({ ...base, limit: 2 })).searchParams.get("size")).toBe("10");
    expect(new URL(buildUrl({ ...base, limit: 25 })).searchParams.get("size")).toBe("25");
    expect(new URL(buildUrl({ ...base, limit: 100 })).searchParams.get("size")).toBe("40");
  });
});
