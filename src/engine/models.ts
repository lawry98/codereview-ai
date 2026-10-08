import { gateway } from "ai";

/** M1 is Claude-only; seats move to other providers only when the eval harness shows quality holds (M5). */
export const DEFAULT_MODEL_IDS = { lead: "anthropic/claude-opus-5.5", seat: "anthropic/claude-sonnet-5.5" } as const;

export function resolveModelIds(env: Partial<NodeJS.ProcessEnv> = process.env): { lead: string; seat: string } {
  return { lead: env.PROOFREAD_LEAD_MODEL || DEFAULT_MODEL_IDS.lead, seat: env.PROOFREAD_SEAT_MODEL || DEFAULT_MODEL_IDS.seat };
}

export function resolveModels(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const ids = resolveModelIds(env);
  return { ids, lead: gateway(ids.lead), seat: gateway(ids.seat) };
}
