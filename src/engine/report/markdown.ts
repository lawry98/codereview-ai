import type { EvidenceEntry } from "../evidence";
import type { ReportFinding } from "../invariants";
import type { ReviewReport } from "./types";

export function renderMarkdown(r: ReviewReport): string {
  const out: string[] = [];
  const t = r.target;

  out.push(`# proofread: ${t.owner}/${t.repo}#${t.number} — ${oneLine(t.title)}`, "");
  out.push("| | |", "|---|---|");
  out.push(`| **PR** | [${t.owner}/${t.repo}#${t.number}](${t.url}) · ${codeSpan(t.baseRef)} ← \`${short(t.headSha)}\` (${t.state}) |`);
  out.push(`| **Merge base** | \`${short(t.mergeBase)}\` |`);
  out.push(`| **Size** | ${t.fileCount} files · ${t.changedLines} changed lines |`);
  out.push(`| **Execution** | ${r.execution === "full" ? "full: dependencies installed, checks run in a sandbox" : "**static-only**: dependencies could not be installed; nothing was executed"} |`);
  out.push(`| **Engine** | proofread ${r.engineVersion} · lead \`${r.stamp.models.lead}\` · seats \`${r.stamp.models.seat}\` |`);
  out.push(`| **Cost** | ${formatCost(r.stamp.usage.costUsd)} · ${formatTokens(r.stamp.usage.inputTokens)} in / ${formatTokens(r.stamp.usage.outputTokens)} out tokens · ${formatDuration(r.stamp.durationMs)} |`);
  out.push(`| **Reviewed** | ${r.stamp.startedAt} |`, "");

  out.push("## Verdict", "", oneLine(r.merged.verdict), "");
  if (r.merged.caveats.length > 0) out.push("**Caveats**", "", ...r.merged.caveats.map((c) => `- ${oneLine(c)}`), "");

  const bySeverity = (s: ReportFinding["severity"]) => r.merged.findings.filter((f) => f.severity === s);
  blockSection(out, "Blockers", "B", bySeverity("blocker"), r.evidence);
  blockSection(out, "Major", "MA", bySeverity("major"), r.evidence);
  tableSection(out, "Minor", "MI", bySeverity("minor"), r.evidence);
  tableSection(out, "Nits", "N", bySeverity("nit"), r.evidence);

  out.push("## Assumptions this PR makes", "");
  if (r.merged.assumptions.length === 0) out.push("No seat reported assumptions.", "");
  else {
    out.push("| Assumption | Seats | Holds? | Why |", "|---|---|---|---|");
    for (const a of r.merged.assumptions) out.push(`| ${oneLine(a.assumption)} | ${oneLine(a.seats.join(", "))} | ${a.status === "holds" ? "holds" : `**${a.status}**`} | ${oneLine(a.why)} |`);
    out.push("");
  }
  listSection(out, "Disagreements", r.merged.disagreements);
  listSection(out, "Doctrine notes", r.merged.doctrineNotes);
  out.push("## What was not checked", "", ...(r.merged.notChecked.length > 0 ? r.merged.notChecked.map((n) => `- ${oneLine(n)}`) : ["Nothing reported."]), "");

  out.push("## The team", "", "| Seat | Why it has a seat | Findings | Steps | Evidence logged | Usage |", "|---|---|---|---|---|---|");
  for (const s of r.team.seated) {
    const usage = `${formatCost(s.usage.costUsd)} · ${formatTokens(s.usage.inputTokens)} in / ${formatTokens(s.usage.outputTokens)} out`;
    out.push(`| ${oneLine(s.name)} | ${oneLine(s.why)} | ${s.error ? `failed: ${oneLine(s.error)}` : s.findings} | ${s.steps} | ${s.evidenceLogged} | ${usage} |`);
  }
  out.push("");
  if (r.team.declined.length > 0) {
    out.push("### Seats considered and declined", "", "| Seat | Why not |", "|---|---|");
    for (const d of r.team.declined) out.push(`| ${d.seat} | ${oneLine(d.reason)} |`);
    out.push("");
  }

  out.push("## Baseline checks", "");
  if (r.baseline.length === 0) out.push("None ran.", "");
  else {
    out.push("| Check | Command | Exit |", "|---|---|---|");
    for (const b of r.baseline) out.push(`| ${oneLine(b.name)} | ${tableCode(b.cmd)} | ${b.exitCode} |`);
    out.push("");
  }

  if (r.evidence.length > 0) {
    out.push("## Evidence", "");
    for (const e of r.evidence) {
      if (e.kind === "command") {
        out.push(`<details><summary><code>${e.id}</code> · <code>${html(flat(e.cmd))}</code> · exit ${e.exitCode}</summary>`, "", fence(e.output || "(no output)"), "", "</details>", "");
      } else {
        out.push(`- \`${e.id}\` · read ${codeSpan(e.path)}`);
      }
    }
    out.push("");
  }

  const engineNotes = [...r.provisionNotes, ...r.invariantNotes];
  if (engineNotes.length > 0) out.push("## Engine notes", "", ...engineNotes.map((n) => `- ${oneLine(n)}`), "");

  return `${out.join("\n").trimEnd()}\n`;
}

function blockSection(out: string[], title: string, prefix: string, findings: ReportFinding[], entries: EvidenceEntry[]): void {
  if (findings.length === 0) return;
  out.push(`## ${title}`, "");
  findings.forEach((f, i) => {
    const evidence = f.evidenceIds.length > 0 ? ` (evidence: ${f.evidenceIds.map((id) => `\`${id}\``).join(", ")})` : "";
    out.push(`### ${prefix}${i + 1} · ${oneLine(f.claim)}`, "");
    out.push(`**${codeSpan(where(f))}** · ${oneLine(f.seats.join(", "))} · ${oneLine(f.category)} · ${status(f, entries)}`, "");
    out.push(`**Fails when.** ${oneLine(f.failsWhen)}`, "");
    out.push(`**Verified by.** ${oneLine(f.verifiedBy)}${evidence}`, "");
    out.push("**Suggested change.**", "", f.suggestedChange.includes("\n") ? fence(f.suggestedChange, "diff") : oneLine(f.suggestedChange), "");
  });
}

function tableSection(out: string[], title: string, prefix: string, findings: ReportFinding[], entries: EvidenceEntry[]): void {
  if (findings.length === 0) return;
  out.push(`## ${title}`, "", "| # | Where | Finding | Verified | Fix |", "|---|---|---|---|---|");
  findings.forEach((f, i) => {
    const verified = f.verified ? `${verifiedLabel(f, entries)}: ${f.evidenceIds.join(", ")}` : status(f, entries);
    out.push(`| ${prefix}${i + 1} | ${tableCode(where(f))} | ${oneLine(f.claim)} | ${oneLine(verified)} | ${oneLine(f.suggestedChange)} |`);
  });
  out.push("");
}

function listSection(out: string[], title: string, items: string[]): void {
  if (items.length === 0) return;
  out.push(`## ${title}`, "", ...items.map((i) => `- ${oneLine(i)}`), "");
}

function status(f: ReportFinding, entries: EvidenceEntry[]): string {
  if (f.verified) return verifiedLabel(f, entries);
  return f.demotedFrom ? `unverified (demoted from ${f.demotedFrom})` : "unverified";
}

/** The invariant counts a logged file read as proof; the label says which kind of proof it was. */
function verifiedLabel(f: ReportFinding, entries: EvidenceEntry[]): string {
  const ranCommand = f.evidenceIds.some((id) => entries.some((e) => e.id === id && e.kind === "command"));
  return ranCommand ? "verified (ran a command)" : "verified (file read only)";
}

const where = (f: ReportFinding) => (f.line ? `${f.path}:${f.line}` : f.path);
const short = (sha: string) => sha.slice(0, 12);
const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const html = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** One line of prose, escaped so attacker-written text cannot start a block, a heading or markup. */
function oneLine(text: string): string {
  return flat(text)
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[`*_[\]|]/g, "\\$&")
    .replace(/^#/, "\\#");
}

/** A code span whose delimiter outlasts every backtick run inside, so the text cannot close it early. */
function codeSpan(text: string): string {
  const body = flat(text);
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(longest + 1);
  const pad = body.startsWith("`") || body.endsWith("`") ? " " : "";
  return `${ticks}${pad}${body}${pad}${ticks}`;
}

/** A bare pipe splits a table row even inside a code span, so table code spans escape it. */
const tableCode = (text: string) => codeSpan(text).replace(/\|/g, "\\|");

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
