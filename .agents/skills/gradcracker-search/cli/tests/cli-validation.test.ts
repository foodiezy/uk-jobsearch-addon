// Offline tests: flag/arg validation. No network requests are made — every
// case here fails validation before any fetch.
import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

function parseErr(stderr: string): { error: string; code: string } {
  return JSON.parse(stderr);
}

describe("cli validation (offline)", () => {
  test("unknown command exits 1 with JSON error on stderr", async () => {
    const r = await runCLI(["frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("");
    expect(parseErr(r.stderr).code).toBe("BAD_CMD");
  });

  test("no command prints help and exits 1", async () => {
    const r = await runCLI([]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("USAGE");
  });

  test("detail without id exits 1 with JSON error", async () => {
    const r = await runCLI(["detail"]);
    expect(r.exitCode).toBe(1);
    expect(parseErr(r.stderr).code).toBe("NO_ID");
  });

  test("detail with a bare numeric id exits 1 (hub id required)", async () => {
    const r = await runCLI(["detail", "81498"]);
    expect(r.exitCode).toBe(1);
    expect(parseErr(r.stderr).code).toBe("BAD_ID");
  });

  test("search with non-numeric --page exits 1", async () => {
    const r = await runCLI(["search", "--page", "two"]);
    expect(r.exitCode).toBe(1);
    expect(parseErr(r.stderr).code).toBe("BAD_ARG");
  });

  test("search with bad --type exits 1", async () => {
    const r = await runCLI(["search", "--type", "internships-only"]);
    expect(r.exitCode).toBe(1);
    expect(parseErr(r.stderr).code).toBe("BAD_ARG");
  });

  test("search combining --query and --location exits 1", async () => {
    const r = await runCLI(["search", "-q", "civil engineer", "-l", "east-midlands"]);
    expect(r.exitCode).toBe(1);
    expect(parseErr(r.stderr).code).toBe("UNSUPPORTED_FLAG");
  });

  test("search with an unknown region exits 1 and lists valid regions", async () => {
    const r = await runCLI(["search", "-l", "bristol"]);
    expect(r.exitCode).toBe(1);
    const err = parseErr(r.stderr);
    expect(err.code).toBe("BAD_LOCATION");
    expect(err.error).toContain("east-midlands");
  });
});
