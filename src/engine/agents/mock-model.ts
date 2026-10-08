import { MockLanguageModelV4 } from "ai/test";

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

let toolCallCounter = 0;

/** A model step that answers with text. `cost` mimics AI Gateway's providerMetadata.gateway.cost. */
export function textStep(text: string, cost = "0.01"): GenerateResult {
  return { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [], providerMetadata: { gateway: { cost } } };
}

export function toolStep(toolName: string, input: unknown, cost = "0.01"): GenerateResult {
  toolCallCounter += 1;
  return {
    content: [{ type: "tool-call", toolCallId: `call-${toolCallCounter}`, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls", raw: undefined },
    usage,
    warnings: [],
    providerMetadata: { gateway: { cost } },
  };
}

/** Returns the given steps in order, one per model call; a call past the last step fails loudly instead of returning undefined. */
export function mockModel(steps: GenerateResult[]): MockLanguageModelV4 {
  let next = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const call = next + 1;
      if (next >= steps.length) throw new Error(`mockModel: model call ${call} has no scripted step (only ${steps.length} were given)`);
      const step = steps[next];
      next += 1;
      return step;
    },
  });
}
