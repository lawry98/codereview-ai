import type { LanguageModelUsage, ProviderMetadata } from "ai";

/** costUsd is null when any contributing call did not report a cost: unmeasured, never guessed. */
export type Usage = { inputTokens: number; outputTokens: number; costUsd: number | null };

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

/** AI Gateway reports per-call cost as providerMetadata.gateway.cost. */
export function gatewayCost(metadata: ProviderMetadata | undefined): number | null {
  const raw = metadata?.gateway?.cost;
  // A blank string would coerce to 0 and pass for a free call; unmeasured means null.
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

export function usageFrom(total: LanguageModelUsage, stepMetadata: Array<ProviderMetadata | undefined>): Usage {
  const costs = stepMetadata.map(gatewayCost);
  const measured = costs.length > 0 && costs.every((cost): cost is number => cost !== null);
  return {
    inputTokens: total.inputTokens ?? 0,
    outputTokens: total.outputTokens ?? 0,
    costUsd: measured ? costs.reduce((sum, cost) => sum + cost, 0) : null,
  };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd,
  };
}
