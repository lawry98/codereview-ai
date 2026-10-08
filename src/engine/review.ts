import type { LanguageModel } from "ai";
import { fallbackMerge, mergeSeatReports, writeBrief } from "./agents/lead";
import type { ReviewContext } from "./agents/prompts";
import type { Merged } from "./agents/schemas";
import { runSeat, SEAT_MAX_STEPS, type SeatRun } from "./agents/seat";
import { makeSeatTools } from "./agents/tools";
import { addUsage, ZERO_USAGE, type Usage } from "./agents/usage";
import { applyLeadDeclines, composeTeam } from "./compose";
import { EvidenceLog } from "./evidence";
import { gatePr } from "./gate";
import type { GitHubClient } from "./github/client";
import { parsePrUrl } from "./github/parse-pr-url";
import { capSeatReport, enforceInvariants } from "./invariants";
import type { ReviewReport } from "./report/types";
import { ROSTER } from "./roster";
import { REPO_DIR } from "./sandbox/policy";
import { provision, type ProvisionResult } from "./sandbox/provision";
import type { SandboxFactory } from "./sandbox/runner";
import { computeSignals, type Signal } from "./signals";
import type { PrTarget } from "./types";
import { mapWithConcurrency } from "./util/concurrency";
import { ENGINE_VERSION } from "./version";

export type ProgressEvent =
  | { type: "stage"; stage: "fetch" | "provision" | "brief" | "seats" | "merge" | "report"; detail?: string }
  | { type: "seat-start"; seat: string }
  | { type: "seat-done"; seat: string; findings: number; error?: string };

export type ReviewLimits = { maxChangedLines: number; seatConcurrency: number; seatMaxSteps: number };

export const DEFAULT_LIMITS: ReviewLimits = { maxChangedLines: 800, seatConcurrency: 4, seatMaxSteps: SEAT_MAX_STEPS };

export type ReviewDeps = {
  github: GitHubClient;
  sandboxes: SandboxFactory;
  models: { lead: LanguageModel; seat: LanguageModel; ids: { lead: string; seat: string } };
  limits?: Partial<ReviewLimits>;
  onProgress?: (event: ProgressEvent) => void;
  now?: () => Date;
};

export type ReviewOutcome =
  | { kind: "rejected"; reason: string; target?: PrTarget }
  | { kind: "unresolved"; problems: string[]; target: PrTarget }
  | { kind: "reviewed"; report: ReviewReport };

export async function reviewPr(url: string, deps: ReviewDeps): Promise<ReviewOutcome> {
  const limits = { ...DEFAULT_LIMITS, ...deps.limits };
  const now = deps.now ?? (() => new Date());
  const progress = deps.onProgress ?? (() => undefined);
  const startedAt = now();

  progress({ type: "stage", stage: "fetch" });
  const target = await deps.github.fetchPr(parsePrUrl(url));
  const gate = gatePr(target.files, { maxChangedLines: limits.maxChangedLines });
  if (!gate.ok) return { kind: "rejected", reason: gate.reason, target };

  const signals = computeSignals(target.files.map((f) => f.path));
  let team = composeTeam({ signals, changedLines: gate.changedLines });

  progress({ type: "stage", stage: "provision" });
  const env = await provision(target, deps.sandboxes);
  if (env.unresolved.length > 0 || env.snapshotId === null || env.mergeBase === null) {
    const problems = env.unresolved.length > 0 ? [...env.unresolved] : ["Sandbox setup did not produce a snapshot."];
    // Provision only snapshots a resolved PR; if a snapshot exists anyway, it must not outlive this call.
    if (env.snapshotId !== null) {
      const failure = await deleteSnapshot(deps.sandboxes, env.snapshotId);
      if (failure !== undefined) problems.push(snapshotNote(env.snapshotId, failure));
    }
    return { kind: "unresolved", problems, target };
  }
  const snapshotId = env.snapshotId;
  const mergeBase = env.mergeBase;

  let snapshotDeleted = false;
  try {
    // env.headSha is the commit the sandbox actually checked out; target.headSha is only what GitHub said a moment earlier.
    const ctx: ReviewContext = { target, headSha: env.headSha, mergeBase, diff: env.diff, baseline: env.baseline, execution: env.execution, provisionNotes: env.notes };
    let usage: Usage = ZERO_USAGE;

    progress({ type: "stage", stage: "brief" });
    const { brief, usage: briefUsage } = await writeBrief({ model: deps.models.lead, ctx, doctrine: env.doctrine, team });
    usage = addUsage(usage, briefUsage);
    team = applyLeadDeclines(team, brief.declineSeats);

    progress({ type: "stage", stage: "seats", detail: team.seated.map((s) => s.seat.id).join(", ") });
    const evidence = new EvidenceLog();
    const runs: SeatRun[] = await mapWithConcurrency(team.seated, limits.seatConcurrency, async ({ seat, why }) => {
      progress({ type: "seat-start", seat: seat.id });
      const runner = await deps.sandboxes.fromSnapshot(snapshotId);
      try {
        const run = await runSeat({
          model: deps.models.seat,
          seat,
          why,
          ctx,
          brief,
          tools: makeSeatTools({ seat: seat.id, runner, evidence, headSha: env.headSha }),
          maxSteps: limits.seatMaxSteps,
        });
        const capped = { ...run, report: capSeatReport(run.report) };
        progress({ type: "seat-done", seat: seat.id, findings: capped.report.findings.length, error: run.error });
        return capped;
      } finally {
        await runner.stop().catch(() => undefined);
      }
    });
    for (const run of runs) usage = addUsage(usage, run.usage);

    const caveats = structuralCaveats(env, runs, target, signals);
    progress({ type: "stage", stage: "merge" });
    let merged: Merged;
    try {
      const result = await mergeSeatReports({ model: deps.models.lead, ctx, brief, runs, caveats });
      usage = addUsage(usage, result.usage);
      merged = { ...result.merged, caveats: [...new Set([...caveats, ...result.merged.caveats])] };
    } catch (error) {
      merged = fallbackMerge(runs, caveats, errorMessage(error));
      usage = { ...usage, costUsd: null };
    }

    // Command output shows absolute sandbox paths and models copy them, so paths are made repo-relative before the existence check.
    merged = { ...merged, findings: merged.findings.map((f) => ({ ...f, path: repoRelative(f.path) })) };
    const headFiles = new Set(env.headFiles);
    const removed = new Set(target.files.filter((f) => f.status === "removed").map((f) => f.path));
    const checked = enforceInvariants(merged, { evidence, fileExists: (p) => headFiles.has(p) || removed.has(p) });
    const cited = new Set(checked.merged.findings.flatMap((f) => f.evidenceIds));

    // The seats are done with the snapshot. A failed delete is reported in the review: it leaves a copy of the PR's repo behind.
    const deleteFailure = await deleteSnapshot(deps.sandboxes, snapshotId);
    snapshotDeleted = true;

    progress({ type: "stage", stage: "report" });
    const report: ReviewReport = {
      version: 1,
      engineVersion: ENGINE_VERSION,
      target: {
        owner: target.owner,
        repo: target.repo,
        number: target.number,
        url: target.url,
        title: target.title,
        state: target.state,
        baseRef: target.baseRef,
        headSha: env.headSha,
        mergeBase,
        changedLines: gate.changedLines,
        fileCount: target.files.length,
      },
      execution: env.execution,
      baseline: env.baseline.map((b) => ({ name: b.check.name, cmd: b.check.cmd, exitCode: b.result.exitCode })),
      team: {
        seated: runs.map((r) => ({
          seat: r.seat.id,
          name: r.seat.name,
          why: r.why,
          findings: checked.merged.findings.filter((f) => f.seats.includes(r.seat.id)).length,
          steps: r.steps,
          usage: r.usage,
          evidenceLogged: evidence.all().filter((e) => e.seat === r.seat.id).length,
          ...(r.error ? { error: r.error } : {}),
        })),
        declined: team.declined,
      },
      merged: checked.merged,
      evidence: evidence.all().filter((e) => cited.has(e.id)),
      invariantNotes: checked.notes,
      provisionNotes: deleteFailure === undefined ? env.notes : [...env.notes, snapshotNote(snapshotId, deleteFailure)],
      stamp: { startedAt: startedAt.toISOString(), durationMs: now().getTime() - startedAt.getTime(), models: deps.models.ids, usage },
    };
    return { kind: "reviewed", report };
  } catch (error) {
    if (snapshotDeleted) throw error;
    const failure = await deleteSnapshot(deps.sandboxes, snapshotId);
    if (failure === undefined) throw error;
    throw new Error(`${errorMessage(error)} (and snapshot ${snapshotId} could not be deleted: ${failure})`, { cause: error });
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const repoRelative = (path: string) => (path.startsWith(`${REPO_DIR}/`) ? path.slice(REPO_DIR.length + 1) : path).replace(/^(\.\/)+/, "");

/** SIGKILL after the per-command timeout, or a sandbox error: the check never finished. */
const didNotFinish = (exitCode: number) => exitCode === 137 || exitCode === -1;

const snapshotNote = (snapshotId: string, failure: string) => `Snapshot ${snapshotId} could not be deleted: ${failure}`;

/** Resolves to why the delete failed, or undefined once it is gone. A snapshot that outlives its review is a leak, so the caller must surface a failure. */
async function deleteSnapshot(sandboxes: SandboxFactory, snapshotId: string): Promise<string | undefined> {
  try {
    await sandboxes.deleteSnapshot(snapshotId);
    return undefined;
  } catch (error) {
    return errorMessage(error);
  }
}

/** Gaps that belong in the first paragraph of the verdict, not in a footnote. */
function structuralCaveats(env: ProvisionResult, runs: SeatRun[], target: PrTarget, signals: Signal[]): string[] {
  const caveats: string[] = [];
  if (env.headSha !== target.headSha) {
    caveats.push(`The PR head moved after its metadata was fetched; this review covers ${env.headSha.slice(0, 12)}, not ${target.headSha.slice(0, 12)}.`);
  }
  if (env.execution === "static-only") caveats.push("Static-only review: dependencies could not be installed, so nothing in this PR was executed.");
  if (env.execution === "full" && env.baseline.length === 0) caveats.push("No typecheck, lint or test command was found, so only commands the reviewers ran verify the findings.");
  // The engine cannot tell why a check failed, so the caveat names the causes it cannot rule out instead of blaming the PR.
  for (const { check, result } of env.baseline) {
    if (result.exitCode === 0) continue;
    caveats.push(
      didNotFinish(result.exitCode)
        ? `Baseline \`${check.name}\` timed out or was cut off at the PR head (exit ${result.exitCode}), so it neither passes nor fails this PR.`
        : `Baseline \`${check.name}\` fails at the PR head (exit ${result.exitCode}). The sandbox has no network, so a test that needs it fails here; otherwise check whether the PR or its base is responsible.`,
    );
  }
  // A seat's structural gap exists whenever its trigger fired, even if the team cap or the lead left the seat out.
  for (const seat of ROSTER) {
    if (!seat.caveat) continue;
    if (runs.some((r) => r.seat.id === seat.id) || seat.triggers.some((t) => signals.includes(t))) caveats.push(seat.caveat);
  }
  for (const r of runs) if (r.error) caveats.push(`The ${r.seat.name} seat failed and contributed nothing: ${r.error}`);
  return caveats;
}
