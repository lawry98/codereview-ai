import { z } from "zod";

export const SEVERITIES = ["blocker", "major", "minor", "nit"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FindingSchema = z.object({
  severity: z.enum(SEVERITIES),
  path: z.string().describe("Repo-relative path of the file the finding is about"),
  line: z.number().nullable().describe("1-based line at the PR head, or null"),
  category: z.string().describe("Short kebab-case label, e.g. off-by-one, stale-comment, prompt-injection"),
  claim: z.string().describe("One or two sentences: what is wrong"),
  failsWhen: z.string().describe("Concrete input or state -> concrete wrong outcome"),
  verifiedBy: z.string().describe("What you ran or read that could have proved you wrong"),
  evidenceIds: z.array(z.string()).describe("evidenceId values returned by run_command / read_file that support this finding"),
  suggestedChange: z.string().describe("A unified diff, or one precise sentence"),
});
export type Finding = z.infer<typeof FindingSchema>;

export const AssumptionSchema = z.object({
  assumption: z.string(),
  status: z.enum(["holds", "unexamined", "wrong"]),
  why: z.string(),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const SeatReportSchema = z.object({
  findings: z.array(FindingSchema).describe("At most six, most severe first"),
  notPursued: z.array(z.string()).describe("One-line mentions of findings ranked below your six"),
  assumptions: z.array(AssumptionSchema).describe("Two to five things this change takes for granted in your lens"),
  notChecked: z.array(z.string()).describe("What you could not reach, and why"),
});
export type SeatReport = z.infer<typeof SeatReportSchema>;

export const BriefSchema = z.object({
  intent: z.string().describe("Two or three sentences: what this change is trying to achieve and what it is betting on"),
  doctrine: z.string().describe("Conventions, named traps and do-not-change warnings from the repo docs that bind this diff"),
  doesNotBind: z.string().describe("Repo docs that do not constrain this change"),
  startHere: z.array(z.object({ seat: z.string(), questions: z.array(z.string()) })),
  declineSeats: z.array(z.object({ seat: z.string(), reason: z.string() })),
});
export type Brief = z.infer<typeof BriefSchema>;

export const MergedFindingSchema = FindingSchema.extend({ seats: z.array(z.string()).describe("Seat ids that reported it") });
export type MergedFinding = z.infer<typeof MergedFindingSchema>;

export const MergedSchema = z.object({
  verdict: z.string(),
  caveats: z.array(z.string()),
  findings: z.array(MergedFindingSchema),
  assumptions: z.array(AssumptionSchema.extend({ seats: z.array(z.string()) })),
  disagreements: z.array(z.string()),
  doctrineNotes: z.array(z.string()),
  notChecked: z.array(z.string()),
});
export type Merged = z.infer<typeof MergedSchema>;
