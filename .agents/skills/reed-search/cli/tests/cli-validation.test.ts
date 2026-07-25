import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

// None of these tests hit the network: flag validation and the API-key check
// both run before any request is made.

const NO_KEY = { REED_API_KEY: undefined };

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("reed CLI: API key handling", () => {
  test("search without REED_API_KEY exits 1 with NO_API_KEY JSON on stderr", async () => {
    const result = await runCLI(["search", "-q", "graduate software engineer"], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("NO_API_KEY");
    expect(err.error).toContain("REED_API_KEY");
    expect(err.error).toContain("https://www.reed.co.uk/developers/jobseeker");
  });

  test("detail without REED_API_KEY exits 1 with NO_API_KEY", async () => {
    const result = await runCLI(["detail", "55555555"], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("NO_API_KEY");
  });

  test("empty REED_API_KEY is treated as unset", async () => {
    const result = await runCLI(["search", "-q", "x"], { REED_API_KEY: "  " });
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("NO_API_KEY");
  });
});

describe("reed CLI: flag validation (before key check, no network)", () => {
  test("bogus flag exits 1 with JSON error on stderr", async () => {
    const result = await runCLI(["search", "--bogus", "value"], NO_KEY);
    expect(result.exitCode).toBe(1);
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("BAD_FLAG");
    expect(err.error).toMatch(/bogus/);
  });

  test("bogus flag on detail exits 1 with BAD_FLAG", async () => {
    const result = await runCLI(["detail", "123456", "--nope"], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_FLAG");
  });

  test("--jobage non-numeric exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "--jobage", "soon"], NO_KEY);
    expect(result.exitCode).toBe(1);
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toMatch(/jobage/);
  });

  test("--page non-numeric exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "--page", "abc"], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("--limit non-numeric exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "--limit", "xyz"], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("--distance non-numeric exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "--distance", "far"], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("--format with invalid value exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "--format", "xml"], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("valid flags reach the key check (NO_API_KEY, not BAD_ARG/BAD_FLAG)", async () => {
    const result = await runCLI(
      ["search", "-q", "junior developer", "-l", "Nottingham", "--distance", "30", "--graduate", "--jobage", "7", "--page", "1", "--limit", "5", "--format", "table"],
      NO_KEY,
    );
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("NO_API_KEY");
  });
});

describe("reed CLI: commands and args", () => {
  test("unknown command exits 1 with BAD_CMD", async () => {
    const result = await runCLI(["frobnicate"], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_CMD");
  });

  test("detail without an id exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("NO_ID");
  });

  test("no command prints help and exits 1", async () => {
    const result = await runCLI([], NO_KEY);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("reed-cli");
  });

  test("--help exits 0 with usage", async () => {
    const result = await runCLI(["search", "--help"], NO_KEY);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("REED_API_KEY");
  });
});
