import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createGitHubClient } from "../src/engine/github/client";
import { resolveModels } from "../src/engine/models";
import { formatCost, formatDuration, renderMarkdown } from "../src/engine/report/markdown";
import { DEFAULT_LIMITS, reviewPr, type ProgressEvent } from "../src/engine/review";
import { createVercelSandboxFactory } from "../src/engine/sandbox/vercel";

const USAGE = "Usage: npm run review -- <github-pr-url> [--out .proofread/reviews] [--max-lines 800]";

function printProgress(event: ProgressEvent): void {
  if (event.type === "stage") console.error(`[${event.stage}]${event.detail ? ` ${event.detail}` : ""}`);
  else if (event.type === "seat-start") console.error(`  · ${event.seat} started`);
  else console.error(`  · ${event.seat} done: ${event.error ? `failed (${event.error})` : `${event.findings} findings`}`);
}

function missingCredentials(env: Partial<NodeJS.ProcessEnv>): string[] {
  const missing: string[] = [];
  if (!env.AI_GATEWAY_API_KEY && !env.VERCEL_OIDC_TOKEN) missing.push("AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN)");
  if (!env.VERCEL_OIDC_TOKEN && !(env.VERCEL_TOKEN && env.VERCEL_TEAM_ID && env.VERCEL_PROJECT_ID)) {
    missing.push("VERCEL_OIDC_TOKEN (run `vercel link` then `vercel env pull .env.local`) or VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID");
  }
  return missing;
}

/** Returns the parsed --max-lines value (or the default), or null when it is not a positive integer. */
function parseMaxLines(raw: string | undefined): number | null {
  if (raw === undefined) return DEFAULT_LIMITS.maxChangedLines;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function main(): Promise<number> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // .env.local is optional; credentials may already be in the environment.
  }

  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: { out: { type: "string", default: ".proofread/reviews" }, "max-lines": { type: "string" } },
    });
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const url = positionals[0];
  if (!url) {
    console.error(USAGE);
    return 2;
  }
  // Validate before anything else runs: a NaN limit would silently disable the changed-lines gate.
  const maxChangedLines = parseMaxLines(values["max-lines"]);
  if (maxChangedLines === null) {
    console.error(`--max-lines must be a positive integer.\n${USAGE}`);
    return 2;
  }
  const missing = missingCredentials(process.env);
  if (missing.length > 0) {
    console.error(`Missing credentials:\n${missing.map((m) => `  - ${m}`).join("\n")}`);
    return 2;
  }

  const outcome = await reviewPr(url, {
    github: createGitHubClient(process.env.GITHUB_TOKEN),
    sandboxes: createVercelSandboxFactory(),
    models: resolveModels(),
    limits: { maxChangedLines },
    onProgress: printProgress,
  });

  if (outcome.kind === "rejected") {
    console.error(`Rejected: ${outcome.reason}`);
    return 1;
  }
  if (outcome.kind === "unresolved") {
    console.error(`Could not review:\n${outcome.problems.map((p) => `  - ${p}`).join("\n")}`);
    return 1;
  }

  const { report } = outcome;
  const outDir = values.out ?? ".proofread/reviews";
  const stamp = report.stamp.startedAt.replace(/[:.]/g, "-");
  const base = join(outDir, `${report.target.owner}__${report.target.repo}__${report.target.number}__${stamp}`);
  await mkdir(outDir, { recursive: true });
  await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${base}.md`, renderMarkdown(report));

  const count = (s: string) => report.merged.findings.filter((f) => f.severity === s).length;
  console.log(`\n${report.target.owner}/${report.target.repo}#${report.target.number}: ${report.target.title}`);
  console.log(`Execution: ${report.execution} · ${formatCost(report.stamp.usage.costUsd)} · ${formatDuration(report.stamp.durationMs)}`);
  console.log(`Findings: ${count("blocker")} blocker · ${count("major")} major · ${count("minor")} minor · ${count("nit")} nit`);
  console.log(`\nVerdict: ${report.merged.verdict}`);
  if (report.merged.caveats.length > 0) console.log(`Caveats:\n${report.merged.caveats.map((c) => `  - ${c}`).join("\n")}`);
  console.log(`\nReport: ${base}.md\nData:   ${base}.json`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  },
);
