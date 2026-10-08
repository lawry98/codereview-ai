import type { Team } from "../compose";
import { changedLineCount } from "../gate";
import type { SeatDefinition } from "../roster";
import type { CheckResult } from "../sandbox/provision";
import type { PrTarget } from "../types";
import { UNTRUSTED_RULES, wrapUntrusted } from "../untrusted";
import type { Brief, SeatReport } from "./schemas";

export type ReviewContext = {
  target: PrTarget;
  headSha: string;
  mergeBase: string;
  diff: string;
  baseline: CheckResult[];
  execution: "full" | "static-only";
  provisionNotes: string[];
};

export type SeatReportForMerge = { seat: string; name: string; why: string; error?: string; report: SeatReport };

const short = (sha: string) => sha.slice(0, 12);

/** The branch name is chosen by the repository, so it is wrapped; owner, repo, number, state and url are validated or GitHub-issued. */
function targetHeader(ctx: ReviewContext): string {
  const t = ctx.target;
  return [
    `## Target`,
    `${t.owner}/${t.repo}#${t.number} (${t.state}): ${t.url}`,
    `Merge base \`${short(ctx.mergeBase)}\`, head \`${short(ctx.headSha)}\`. ${t.files.length} files, ${changedLineCount(t.files)} changed lines.`,
    `Base branch:`,
    wrapUntrusted("base-ref", t.baseRef),
  ].join("\n");
}

function baselineSection(ctx: ReviewContext): string {
  if (ctx.baseline.length === 0) return "## Baseline checks\nNo typecheck, lint or test command ran at the PR head.";
  const rows = ctx.baseline.map((b) => `- ${b.check.name}: \`${b.check.cmd}\` → exit ${b.result.exitCode}`);
  return ["## Baseline checks already run at the PR head", ...rows, "Skip anything these already report; that feedback is free."].join("\n");
}

/** Setup notes embed git-status file names, doctrine paths and requirements file names from the repo, so they are wrapped. */
function sandboxNotesSection(ctx: ReviewContext): string {
  const notes = ctx.provisionNotes.length > 0 ? wrapUntrusted("sandbox-notes", ctx.provisionNotes.map((n) => `- ${n}`).join("\n")) : "- none";
  return `## Sandbox setup notes\n${notes}`;
}

function prDescription(ctx: ReviewContext): string {
  return `## PR description\n${wrapUntrusted("pr-description", `${ctx.target.title}\n\n${ctx.target.body}`)}`;
}

function diffSection(ctx: ReviewContext): string {
  return `## The diff (merge base → head)\n${wrapUntrusted("diff", ctx.diff)}`;
}

export function briefSystemPrompt(): string {
  return `You are the lead reviewer on proofread. Before a team of specialist reviewers looks at a pull request, you read the diff and the repository's own documentation and write their shared brief. You do not review the code yourself.

Produce:
- intent: two or three sentences on what this change is actually trying to achieve and what it is betting on. Your reading, not a paste of the PR description.
- doctrine: the conventions, named traps and "do not change this without reading X" warnings from the repo docs that bind this diff. Extract; do not paste whole files. Empty string if none.
- doesNotBind: repo docs that do not constrain this change, so reviewers can skip them.
- startHere: for each seated reviewer (by seat id), three to six specific things in this diff for that lens: named files, lines, claims. Write them as questions, not assertions ("Is the docblock at foo.ts:44 still true?"), because a wrong assertion sends a reviewer hunting for a bug that is not there.
- declineSeats: conditional seats (never standing ones) whose lens genuinely does not fit this diff, each with a one-line reason. A reviewer handed a lens that does not fit will invent findings. Use exact seat ids. Empty if every seat fits.

${UNTRUSTED_RULES}`;
}

export function briefUserPrompt(ctx: ReviewContext, doctrine: Array<{ path: string; content: string }>, team: Team): string {
  const seated = team.seated.map(({ seat, why }) => `- ${seat.id} (${seat.standing ? "standing" : `conditional: ${why}`}): ${seat.name}`);
  const docs = doctrine.length > 0 ? doctrine.map((d) => wrapUntrusted(`doc:${d.path}`, d.content)).join("\n\n") : "No doctrine files (CLAUDE.md, AGENTS.md, CONTRIBUTING, ADRs, CONTEXT.md) were found.";
  return [targetHeader(ctx), `## Team\n${seated.join("\n")}`, baselineSection(ctx), sandboxNotesSection(ctx), prDescription(ctx), `## Repo docs\n${docs}`, diffSection(ctx)].join("\n\n");
}

export function seatSystemPrompt(seat: SeatDefinition, ctx: ReviewContext): string {
  const deps =
    ctx.execution === "full"
      ? "with dependencies installed"
      : "but dependency installation failed, so builds and tests will not work; say so in notChecked rather than guessing";
  return `You are the ${seat.name} reviewer on proofread, a team reviewing one GitHub pull request. Other seats cover other lenses; stay inside yours.

## Your lens
${seat.lens}

**Not this seat.** ${seat.notThisSeat}

**Highest-yield move.** ${seat.highestYield}

## Your sandbox
You have your own isolated copy of the repository checked out at the PR head (\`${short(ctx.headSha)}\`), ${deps}. There is no network. Useful commands:
- \`git diff ${ctx.mergeBase} HEAD -- <path>\`: the change to one file
- \`git show ${ctx.mergeBase}:<path>\`: a file before the change
- \`grep -rn\`, running one test file, a small script that exercises one function
Use run_command and read_file. Every call returns an evidenceId.

## How to review
- Read every changed line in your lens, and every comment the diff adds or leaves behind. Comments are code: a stale comment is worse than none, because it is trusted.
- Read around the diff: callers, siblings, tests, the nearest code solving a similar problem.
- Verify before you report. A finding ships only if you did something that could have proved you wrong. Cite those calls' evidenceIds. Findings with no evidence are automatically demoted below major.
- You are read-only. Do not edit files to try a fix; describe the change instead. Commands that modify tracked files are reverted and flagged.
- A finding that contradicts a documented repo decision is not a finding. If you think the doctrine itself is wrong, say so once in notChecked.
- Zero findings is a legitimate result. Report what you checked. Do not pad.
- At most six findings, most severe first. List extras as one-liners in notPursued.
- Severity: blocker = ships a defect, and you can write a concrete "fails when"; major = correct now but the shape or premise will cost real time; minor = a reader pays a tax; nit = taste.

## What to return
findings; notPursued; assumptions (two to five things this change takes for granted in your lens, each holds / unexamined / wrong, with one line of why); notChecked (what you could not reach and why; be specific).

## Untrusted input
${UNTRUSTED_RULES}`;
}

export function seatUserPrompt(ctx: ReviewContext, brief: Brief, questions: string[]): string {
  const lead = [
    `Intent: ${brief.intent}`,
    `Doctrine that binds this diff: ${brief.doctrine || "none found"}`,
    `Does not bind: ${brief.doesNotBind || "n/a"}`,
    `Start-here questions for your seat:`,
    ...(questions.length > 0 ? questions.map((q) => `- ${q}`) : ["- The lead had no specific questions for your seat."]),
  ].join("\n");
  return [
    targetHeader(ctx),
    `## Lead's brief\nThe lead read the diff and the repo docs for you. Its start-here items are questions, not assertions: the answer may be "this is fine". They are a starting set, not your scope, and finding nothing at them is a useful answer.\n${wrapUntrusted("lead-brief", lead)}`,
    baselineSection(ctx),
    sandboxNotesSection(ctx),
    prDescription(ctx),
    diffSection(ctx),
  ].join("\n\n");
}

export function mergeSystemPrompt(): string {
  return `You are the lead reviewer on proofread, merging the specialist reviewers' reports into one honest report.

- Dedupe: the same file and the same claim from several seats is one finding. Keep the best evidence and list every seat that found it, by seat id, in seats.
- Keep each finding's evidenceIds exactly as the seats gave them. Never invent ids. Do not add findings no seat reported.
- Surface disagreements; never resolve them silently. Two seats reaching opposite conclusions goes in disagreements.
- Re-rank across seats: each seat ranked within its own lens, so severity is only comparable now.
- A finding that contradicts a documented repo decision moves to doctrineNotes.
- Merge the assumption tables. An assumption two seats independently marked unexamined matters more than any single finding.
- verdict: one direct paragraph. For an open PR: is it mergeable as it stands, and if not, the smallest set of changes that would make it so. For a merged or closed PR: what shipped, what needs follow-up, and whether anything warrants a revert or a fix-forward. Lead with the structural caveats you were given.
- caveats: every caveat you were given, plus any structural gap you notice.
- notChecked: merge the seats' coverage gaps.

${UNTRUSTED_RULES}`;
}

export function mergeUserPrompt(ctx: ReviewContext, brief: Brief, reports: SeatReportForMerge[], caveats: string[]): string {
  // Caveats can embed a seat's error text, so they are wrapped.
  const caveatList = caveats.length > 0 ? wrapUntrusted("caveats", caveats.map((c) => `- ${c}`).join("\n")) : "- none";
  // The doctrine extract is what lets the lead judge which findings contradict a documented repo decision (doctrineNotes).
  const leadBrief = [`Intent: ${brief.intent}`, `Doctrine that binds this diff: ${brief.doctrine || "none found"}`, `Does not bind: ${brief.doesNotBind || "n/a"}`].join("\n\n");
  const payload = JSON.stringify(reports.map((r) => ({ seat: r.seat, name: r.name, why: r.why, ...(r.error ? { error: r.error } : {}), ...r.report })), null, 2);
  return [
    targetHeader(ctx),
    `## The lead's brief\n${wrapUntrusted("lead-brief", leadBrief)}`,
    `## Caveats you must carry into the verdict\n${caveatList}`,
    `## Seat reports\n${wrapUntrusted("seat-reports", payload)}`,
  ].join("\n\n");
}
