import type { ReportFinding } from "../invariants";
import type { ReviewReport } from "./types";

export function renderMarkdown(r: ReviewReport): string {
  const out: string[] = [];
  const t = r.target;

  out.push(`# proofread: ${t.owner}/${t.repo}#${t.number} — ${t.title}`, "");
  out.push("| | |", "|---|---|");
  out.push(`| **PR** | [${t.owner}/${t.repo}#${t.number}](${t.url}) · \`${t.baseRef}\` ← \`${short(t.headSha)}\` (${t.state}) |`);
  out.push(`| **Merge base** | \`${short(t.mergeBase)}\` |`);
  out.push(`| **Size** | ${t.fileCount} files · ${t.changedLines} changed lines |`);
  out.push(`| **Execution** | ${r.execution === "full" ? "full: dependencies installed, checks run in a sandbox" : "**static-only**: dependencies could not be installed; nothing was executed"} |`);
  out.push(`| **Engine** | proofread ${r.engineVersion} · lead \`${r.stamp.models.lead}\` · seats \`${r.stamp.models.seat}\` |`);
  out.push(`| **Cost** | ${formatCost(r.stamp.usage.costUsd)} · ${formatTokens(r.stamp.usage.inputTokens)} in / ${formatTokens(r.stamp.usage.outputTokens)} out tokens · ${formatDuration(r.stamp.durationMs)} |`);
  out.push(`| **Reviewed** | ${r.stamp.startedAt} |`, "");

  out.push("## Verdict", "", r.merged.verdict, "");
  if (r.merged.caveats.length > 0) out.push("**Caveats**", "", ...r.merged.caveats.map((c) => `- ${c}`), "");

  const bySeverity = (s: ReportFinding["severity"]) => r.merged.findings.filter((f) => f.severity === s);
  blockSection(out, "Blockers", "B", bySeverity("blocker"));
  blockSection(out, "Major", "MA", bySeverity("major"));
  tableSection(out, "Minor", "MI", bySeverity("minor"));
  tableSection(out, "Nits", "N", bySeverity("nit"));

  out.push("## Assumptions this PR makes", "");
  if (r.merged.assumptions.length === 0) out.push("No seat reported assumptions.", "");
  else {
    out.push("| Assumption | Seats | Holds? | Why |", "|---|---|---|---|");
    for (const a of r.merged.assumptions) out.push(`| ${cell(a.assumption)} | ${cell(a.seats.join(", "))} | ${a.status === "holds" ? "holds" : `**${a.status}**`} | ${cell(a.why)} |`);
    out.push("");
  }
  listSection(out, "Disagreements", r.merged.disagreements);
  listSection(out, "Doctrine notes", r.merged.doctrineNotes);
  out.push("## What was not checked", "", ...(r.merged.notChecked.length > 0 ? r.merged.notChecked.map((n) => `- ${n}`) : ["Nothing reported."]), "");

  out.push("## The team", "", "| Seat | Why it has a seat | Findings |", "|---|---|---|");
  for (const s of r.team.seated) out.push(`| ${cell(s.name)} | ${cell(s.why)} | ${s.error ? `failed: ${cell(s.error)}` : s.findings} |`);
  out.push("");
  if (r.team.declined.length > 0) {
    out.push("### Seats considered and declined", "", "| Seat | Why not |", "|---|---|");
    for (const d of r.team.declined) out.push(`| ${d.seat} | ${cell(d.reason)} |`);
    out.push("");
  }

  out.push("## Baseline checks", "");
  if (r.baseline.length === 0) out.push("None ran.", "");
  else {
    out.push("| Check | Command | Exit |", "|---|---|---|");
    for (const b of r.baseline) out.push(`| ${b.name} | \`${cell(b.cmd)}\` | ${b.exitCode} |`);
    out.push("");
  }

  if (r.evidence.length > 0) {
    out.push("## Evidence", "");
    for (const e of r.evidence) {
      if (e.kind === "command") {
        out.push(`<details><summary><code>${e.id}</code> · <code>${html(e.cmd)}</code> · exit ${e.exitCode}</summary>`, "", fence(e.output || "(no output)"), "", "</details>", "");
      } else {
        out.push(`- \`${e.id}\` · read \`${e.path}\``);
      }
    }
    out.push("");
  }

  const engineNotes = [...r.provisionNotes, ...r.invariantNotes];
  if (engineNotes.length > 0) out.push("## Engine notes", "", ...engineNotes.map((n) => `- ${n}`), "");

  return `${out.join("\n").trimEnd()}\n`;
}

function blockSection(out: string[], title: string, prefix: string, findings: ReportFinding[]): void {
  if (findings.length === 0) return;
  out.push(`## ${title}`, "");
  findings.forEach((f, i) => {
    const evidence = f.evidenceIds.length > 0 ? ` (evidence: ${f.evidenceIds.map((id) => `\`${id}\``).join(", ")})` : "";
    out.push(`### ${prefix}${i + 1} · ${f.claim}`, "");
    out.push(`**\`${where(f)}\`** · ${f.seats.join(", ")} · ${f.category} · ${status(f)}`, "");
    out.push(`**Fails when.** ${f.failsWhen}`, "");
    out.push(`**Verified by.** ${f.verifiedBy}${evidence}`, "");
    out.push("**Suggested change.**", "", f.suggestedChange.includes("\n") ? fence(f.suggestedChange, "diff") : f.suggestedChange, "");
  });
}

function tableSection(out: string[], title: string, prefix: string, findings: ReportFinding[]): void {
  if (findings.length === 0) return;
  out.push(`## ${title}`, "", "| # | Where | Finding | Verified | Fix |", "|---|---|---|---|---|");
  findings.forEach((f, i) => {
    const verified = f.verified ? `yes (${f.evidenceIds.join(", ")})` : status(f);
    out.push(`| ${prefix}${i + 1} | \`${cell(where(f))}\` | ${cell(f.claim)} | ${cell(verified)} | ${cell(f.suggestedChange)} |`);
  });
  out.push("");
}

function listSection(out: string[], title: string, items: string[]): void {
  if (items.length === 0) return;
  out.push(`## ${title}`, "", ...items.map((i) => `- ${i}`), "");
}

function status(f: ReportFinding): string {
  if (f.verified) return "verified";
  return f.demotedFrom ? `unverified (demoted from ${f.demotedFrom})` : "unverified";
}

const where = (f: ReportFinding) => (f.line ? `${f.path}:${f.line}` : f.path);
const short = (sha: string) => sha.slice(0, 12);
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const html = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A code fence longer than any backtick run inside the text, so command output cannot break out of it. */
export function fence(text: string, lang = ""): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}${lang}\n${text.replace(/\n$/, "")}\n${ticks}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatCost(usd: number | null): string {
  return usd === null ? "unmeasured" : `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  return n < 1000 ? String(n) : `${Math.round(n / 1000)}k`;
}
