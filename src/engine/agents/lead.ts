import { generateText, Output, type LanguageModel } from "ai";
import type { Team } from "../compose";
import { briefSystemPrompt, briefUserPrompt, mergeSystemPrompt, mergeUserPrompt, type ReviewContext } from "./prompts";
import { BriefSchema, MergedSchema, type Brief, type Merged } from "./schemas";
import type { SeatRun } from "./seat";
import { usageFrom, type Usage } from "./usage";

export async function writeBrief(input: {
  model: LanguageModel;
  ctx: ReviewContext;
  doctrine: Array<{ path: string; content: string }>;
  team: Team;
}): Promise<{ brief: Brief; usage: Usage }> {
  const result = await generateText({
    model: input.model,
    system: briefSystemPrompt(),
    prompt: briefUserPrompt(input.ctx, input.doctrine, input.team),
    output: Output.object({ schema: BriefSchema }),
  });
  return { brief: result.output, usage: usageFrom(result.totalUsage, result.steps.map((s) => s.providerMetadata)) };
}

export async function mergeSeatReports(input: {
  model: LanguageModel;
  ctx: ReviewContext;
  brief: Brief;
  runs: SeatRun[];
  caveats: string[];
}): Promise<{ merged: Merged; usage: Usage }> {
  const reports = input.runs.map((r) => ({ seat: r.seat.id, name: r.seat.name, why: r.why, error: r.error, report: r.report }));
  const result = await generateText({
    model: input.model,
    system: mergeSystemPrompt(),
    prompt: mergeUserPrompt(input.ctx, input.brief, reports, input.caveats),
    output: Output.object({ schema: MergedSchema }),
  });
  return { merged: result.output, usage: usageFrom(result.totalUsage, result.steps.map((s) => s.providerMetadata)) };
}

/** When the merge call fails, ship the seats' work undeduplicated rather than nothing. */
export function fallbackMerge(runs: SeatRun[], caveats: string[], reason: string): Merged {
  return {
    verdict: "The merge step failed, so these are the seats' findings side by side, without deduplication or a cross-seat verdict. Read them as separate reports.",
    caveats: [...caveats, `Merge step failed: ${reason}`],
    findings: runs.flatMap((r) => r.report.findings.map((f) => ({ ...f, seats: [r.seat.id] }))),
    assumptions: runs.flatMap((r) => r.report.assumptions.map((a) => ({ ...a, seats: [r.seat.id] }))),
    disagreements: [],
    doctrineNotes: [],
    notChecked: runs.flatMap((r) => r.report.notChecked.map((n) => `${r.seat.name}: ${n}`)),
  };
}
