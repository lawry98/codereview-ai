import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { addUsage, gatewayCost, usageFrom } from "./usage";

const total: LanguageModelUsage = {
  inputTokens: 1200,
  outputTokens: 300,
  totalTokens: 1500,
  inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
};

describe("gatewayCost", () => {
  it("reads string and number costs", () => {
    expect(gatewayCost({ gateway: { cost: "0.0123" } })).toBeCloseTo(0.0123);
    expect(gatewayCost({ gateway: { cost: 0.5 } })).toBe(0.5);
  });
  it("returns null when the gateway did not report a cost", () => {
    expect(gatewayCost(undefined)).toBeNull();
    expect(gatewayCost({ anthropic: {} })).toBeNull();
    expect(gatewayCost({ gateway: { cost: "n/a" } })).toBeNull();
    expect(gatewayCost({ gateway: { cost: "" } })).toBeNull();
    expect(gatewayCost({ gateway: { cost: null } })).toBeNull();
  });
});

describe("usageFrom", () => {
  it("sums step costs", () => {
    expect(usageFrom(total, [{ gateway: { cost: "0.01" } }, { gateway: { cost: "0.02" } }])).toEqual({ inputTokens: 1200, outputTokens: 300, costUsd: expect.closeTo(0.03) });
  });
  it("is unmeasured if any step lacks a cost", () => {
    expect(usageFrom(total, [{ gateway: { cost: "0.01" } }, undefined]).costUsd).toBeNull();
  });
});

describe("addUsage", () => {
  it("adds tokens and propagates unmeasured cost", () => {
    const a = { inputTokens: 1, outputTokens: 2, costUsd: 0.1 };
    expect(addUsage(a, { inputTokens: 3, outputTokens: 4, costUsd: 0.2 })).toEqual({ inputTokens: 4, outputTokens: 6, costUsd: expect.closeTo(0.3) });
    expect(addUsage(a, { inputTokens: 0, outputTokens: 0, costUsd: null }).costUsd).toBeNull();
  });
});
