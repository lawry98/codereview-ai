import { SEVERITIES, type Merged, type MergedFinding, type SeatReport, type Severity } from "./agents/schemas";
import type { EvidenceLog } from "./evidence";

export type ReportFinding = MergedFinding & { verified: boolean; demotedFrom?: Severity };
export type CheckedMerged = Omit<Merged, "findings"> & { findings: ReportFinding[] };

export const MAX_SEAT_FINDINGS = 6;
export const MAX_ASSUMPTIONS = 5;
export const MAX_NITS = 10;

const where = (f: { path: string; line: number | null }) => (f.line ? `${f.path}:${f.line}` : f.path);

/** Most severe first. Array sort is stable, so the model's order holds within a severity. */
const bySeverity = (a: { severity: Severity }, b: { severity: Severity }) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);

/** Six proved findings beat fourteen skimmed ones; extras survive as one-liners. The cut is by severity, not the model's order. */
export function capSeatReport(report: SeatReport): SeatReport {
  const ranked = [...report.findings].sort(bySeverity);
  const extra = ranked.slice(MAX_SEAT_FINDINGS).map((f) => `${f.claim} (${where(f)})`);
  return {
    ...report,
    findings: ranked.slice(0, MAX_SEAT_FINDINGS),
    assumptions: report.assumptions.slice(0, MAX_ASSUMPTIONS),
    notPursued: [...report.notPursued, ...extra],
  };
}

/** Deterministic checks on the merged report. Models propose; these rules decide what ships. */
export function enforceInvariants(
  merged: Merged,
  ctx: { evidence: EvidenceLog; fileExists: (path: string) => boolean },
): { merged: CheckedMerged; notes: string[] } {
  const notes: string[] = [];
  const findings: ReportFinding[] = [];

  for (const finding of merged.findings) {
    const label = `${where(finding)} "${finding.claim.slice(0, 80)}"`;
    if (!ctx.fileExists(finding.path)) {
      notes.push(`Dropped ${label}: the cited file does not exist at the PR head.`);
      continue;
    }
    const evidenceIds = finding.evidenceIds.filter((id) => ctx.evidence.has(id));
    if (evidenceIds.length < finding.evidenceIds.length) notes.push(`Removed unknown evidence ids from ${label}.`);
    const verified = evidenceIds.length > 0;
    if (!verified && (finding.severity === "blocker" || finding.severity === "major")) {
      notes.push(`Demoted ${label} from ${finding.severity} to minor: it cites no evidence.`);
      findings.push({ ...finding, evidenceIds, verified, severity: "minor", demotedFrom: finding.severity });
    } else {
      findings.push({ ...finding, evidenceIds, verified });
    }
  }

  findings.sort(bySeverity);
  const extraNits = new Set(findings.filter((f) => f.severity === "nit").slice(MAX_NITS));
  if (extraNits.size > 0) notes.push(`Cut ${extraNits.size} nits beyond the first ${MAX_NITS}.`);

  return { merged: { ...merged, findings: findings.filter((f) => !extraNits.has(f)) }, notes };
}
