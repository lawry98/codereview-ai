import type { Usage } from "../agents/usage";
import type { EvidenceEntry } from "../evidence";
import type { CheckedMerged } from "../invariants";
import type { SeatId } from "../roster";
import type { PrState } from "../types";

export type ReviewReport = {
  version: 1;
  engineVersion: string;
  target: {
    owner: string;
    repo: string;
    number: number;
    url: string;
    title: string;
    state: PrState;
    baseRef: string;
    headSha: string;
    mergeBase: string;
    changedLines: number;
    fileCount: number;
  };
  execution: "full" | "static-only";
  baseline: Array<{ name: string; cmd: string; exitCode: number }>;
  team: {
    /** steps, usage and evidenceLogged tell a seat that found nothing apart from one that never ran a tool. */
    seated: Array<{ seat: SeatId; name: string; why: string; findings: number; steps: number; usage: Usage; evidenceLogged: number; error?: string }>;
    declined: Array<{ seat: SeatId; reason: string }>;
  };
  merged: CheckedMerged;
  /** Only the entries cited by a finding that shipped. */
  evidence: EvidenceEntry[];
  invariantNotes: string[];
  provisionNotes: string[];
  stamp: { startedAt: string; durationMs: number; models: { lead: string; seat: string }; usage: Usage };
};
