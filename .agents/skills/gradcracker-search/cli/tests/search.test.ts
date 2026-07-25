// Live smoke tests — two real requests to gradcracker.com. Keep it minimal.
import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

interface SearchPayload {
  meta: { count: number; page: number; total?: number };
  results: Array<{
    id: string | null;
    title: string | null;
    company: string | null;
    location: string | null;
    date: string | null;
    deadline: string | null;
    url: string | null;
  }>;
}

describe("live search", () => {
  test('keyword search "software engineer" returns real results', async () => {
    const r = await runCLI(["search", "-q", "software engineer", "--limit", "5"]);
    expect(r.exitCode).toBe(0);
    const data = parseJSON<SearchPayload>(r);
    expect(data.meta.count).toBeGreaterThanOrEqual(1);
    expect(data.meta.page).toBe(1);
    for (const job of data.results) {
      expect(job.id).toMatch(/^\d+-\d+$/);
      expect(job.title).toBeTruthy();
      expect(job.title).not.toMatch(/[<>]/); // no HTML fragments
      expect(job.url).toMatch(
        /^https:\/\/www\.gradcracker\.com\/hub\/\d+\/[^/]+\/(graduate-job|work-placement-internship|degree-apprenticeship)\/\d+\//
      );
      expect(job.date).toBeNull(); // Gradcracker publishes no posting dates
    }
  }, 30000);

  test("discipline browse (computing-technology) returns results", async () => {
    const r = await runCLI(["search", "-t", "graduate-jobs", "--limit", "3"]);
    expect(r.exitCode).toBe(0);
    const data = parseJSON<SearchPayload>(r);
    expect(data.meta.count).toBeGreaterThanOrEqual(1);
    expect(data.results[0].id).toMatch(/^\d+-\d+$/);
    expect(data.results[0].title).toBeTruthy();
    expect(data.results[0].company).toBeTruthy();
  }, 30000);
});
