// Offline tests: flag/arg validation. No network requests are made — every
// case here fails validation (or short-circuits to --help) before runSearch
// ever calls jsonFetch. Prospects has no API key, so unlike reed-search there
// is no auth gate to stop a *valid* search before the network call — that
// means we must never exercise a fully-valid `search` invocation here.
import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

function parseErr(stderr: string): { error: string; code: string } {
  return JSON.parse(stderr);
}

describe("cli validation (offline)", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("USAGE");
  });

  test("unknown command exits 1 with BAD_CMD", async () => {
    const r = await runCLI(["frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("");
    expect(parseErr(r.stderr).code).toBe("BAD_CMD");
  });

  test("search --help exits 0 with usage", async () => {
    const r = await runCLI(["search", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("prospects-cli");
    expect(r.stdout).toContain("--query");
  });

  test("search without --query exits 1 with NO_QUERY", async () => {
    const r = await runCLI(["search"]);
    expect(r.exitCode).toBe(1);
    expect(parseErr(r.stderr).code).toBe("NO_QUERY");
  });

  test("search with a bare -q flag (no value) exits 1 with NO_QUERY", async () => {
    const r = await runCLI(["search", "-q"]);
    expect(r.exitCode).toBe(1);
    expect(parseErr(r.stderr).code).toBe("NO_QUERY");
  });

  test("search with a whitespace-only --query exits 1 with NO_QUERY", async () => {
    const r = await runCLI(["search", "--query", "   "]);
    expect(r.exitCode).toBe(1);
    expect(parseErr(r.stderr).code).toBe("NO_QUERY");
  });

  test("search with non-numeric --page exits 1 with BAD_ARG", async () => {
    const r = await runCLI(["search", "-q", "software engineer", "--page", "two"]);
    expect(r.exitCode).toBe(1);
    const err = parseErr(r.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toContain("--page");
  });

  test("search with non-numeric --limit (-n) exits 1 with BAD_ARG", async () => {
    const r = await runCLI(["search", "-q", "software engineer", "-n", "lots"]);
    expect(r.exitCode).toBe(1);
    const err = parseErr(r.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toContain("--limit");
  });

  test("search with non-numeric --jobage exits 1 with BAD_ARG", async () => {
    const r = await runCLI(["search", "-q", "software engineer", "--jobage", "soon"]);
    expect(r.exitCode).toBe(1);
    const err = parseErr(r.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toContain("--jobage");
  });

  test("search with an invalid --sort (-s) exits 1 with BAD_ARG", async () => {
    const r = await runCLI(["search", "-q", "software engineer", "-s", "newest"]);
    expect(r.exitCode).toBe(1);
    const err = parseErr(r.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toMatch(/dp or rl/);
  });
});
