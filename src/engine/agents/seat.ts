import { generateText, Output, stepCountIs, type LanguageModel } from "ai";
import type { SeatDefinition } from "../roster";
import { SANDBOX_LIMITS } from "../sandbox/policy";
import { seatSystemPrompt, seatUserPrompt, type ReviewContext } from "./prompts";
import { SeatReportSchema, type Brief, type SeatReport } from "./schemas";
import type { SeatTools } from "./tools";
import { usageFrom, type Usage } from "./usage";

export type SeatRun = {
  seat: SeatDefinition;
  why: string;
  report: SeatReport;
  usage: Usage;
  steps: number;
  durationMs: number;
  error?: string;
};

export const SEAT_MAX_STEPS = 40;

/**
 * Output caps and timeouts for every model call. Left unset, the provider's default output cap can truncate a report into
 * a schema failure, and a hung call is bounded only by the HTTP client's retries. `timeout.totalMs` covers the whole call,
 * tool steps included.
 */
export const MODEL_CALL_LIMITS = {
  /** Ends the seat before its sandbox's own timeout, after which the SDK silently resumes into a fresh, empty session. */
  seat: { maxOutputTokens: 16_000, timeout: { totalMs: SANDBOX_LIMITS.sandboxTimeoutMs - 5 * 60_000 } },
  brief: { maxOutputTokens: 16_000, timeout: { totalMs: 10 * 60_000 } },
  /** A seven-seat merge is the longest output in a review. */
  merge: { maxOutputTokens: 32_000, timeout: { totalMs: 15 * 60_000 } },
} as const;

/** Runs one seat as a tool loop in its own sandbox. Never throws: a failed seat returns an empty report that says why. */
export async function runSeat(input: {
  model: LanguageModel;
  seat: SeatDefinition;
  why: string;
  ctx: ReviewContext;
  brief: Brief;
  tools: SeatTools;
  maxSteps?: number;
}): Promise<SeatRun> {
  const started = Date.now();
  const maxSteps = input.maxSteps ?? SEAT_MAX_STEPS;
  const questions = input.brief.startHere.find((s) => s.seat === input.seat.id)?.questions ?? [];
  try {
    const result = await generateText({
      model: input.model,
      system: seatSystemPrompt(input.seat, input.ctx),
      prompt: seatUserPrompt(input.ctx, input.brief, questions),
      tools: input.tools,
      stopWhen: stepCountIs(maxSteps),
      // On the last allowed step, force the report instead of another tool call.
      prepareStep: ({ stepNumber }) => (stepNumber >= maxSteps - 1 ? { toolChoice: "none" as const } : {}),
      output: Output.object({ schema: SeatReportSchema }),
      ...MODEL_CALL_LIMITS.seat,
    });
    return {
      seat: input.seat,
      why: input.why,
      report: result.output,
      usage: usageFrom(result.totalUsage, result.steps.map((s) => s.providerMetadata)),
      steps: result.steps.length,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      seat: input.seat,
      why: input.why,
      report: { findings: [], notPursued: [], assumptions: [], notChecked: [`This seat failed and contributed nothing: ${message}`] },
      usage: { inputTokens: 0, outputTokens: 0, costUsd: null },
      steps: 0,
      durationMs: Date.now() - started,
      error: message,
    };
  }
}
