import { join } from "path";

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the CLI as a subprocess. `envOverrides` merges into the parent env;
 * set a key to undefined to remove it (e.g. { REED_API_KEY: undefined }).
 */
export async function runCLI(
  args: string[],
  envOverrides: Record<string, string | undefined> = {}
): Promise<CLIResult> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...envOverrides })) {
    if (v !== undefined) env[k] = v;
  }
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export function parseJSON<T = unknown>(result: CLIResult): T {
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI exited with code ${result.exitCode}. stderr: ${result.stderr}`
    );
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(
      `Failed to parse JSON. stdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
}
