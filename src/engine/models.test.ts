import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_IDS, resolveModelIds, resolveModels } from "./models";

describe("resolveModelIds", () => {
  it("defaults to Claude via AI Gateway", () => {
    expect(resolveModelIds({})).toEqual({ lead: "anthropic/claude-opus-5.5", seat: "anthropic/claude-sonnet-5.5" });
    expect(DEFAULT_MODEL_IDS.seat).toBe("anthropic/claude-sonnet-5.5");
  });
  it("lets env vars override each role", () => {
    expect(resolveModelIds({ PROOFREAD_SEAT_MODEL: "google/gemini-3.8-flash" })).toEqual({ lead: "anthropic/claude-opus-5.5", seat: "google/gemini-3.8-flash" });
    expect(resolveModelIds({ PROOFREAD_LEAD_MODEL: "openai/gpt-6" })).toEqual({ lead: "openai/gpt-6", seat: "anthropic/claude-sonnet-5.5" });
  });
  it("treats an empty override as unset", () => {
    expect(resolveModelIds({ PROOFREAD_LEAD_MODEL: "", PROOFREAD_SEAT_MODEL: "" })).toEqual({ lead: "anthropic/claude-opus-5.5", seat: "anthropic/claude-sonnet-5.5" });
  });
});

describe("resolveModels", () => {
  it("returns the resolved ids alongside gateway models for them, without any network call", () => {
    const models = resolveModels({ PROOFREAD_SEAT_MODEL: "google/gemini-3.8-flash" });
    expect(models.ids).toEqual({ lead: "anthropic/claude-opus-5.5", seat: "google/gemini-3.8-flash" });
    expect(models.lead).toMatchObject({ modelId: "anthropic/claude-opus-5.5" });
    expect(models.seat).toMatchObject({ modelId: "google/gemini-3.8-flash" });
  });
});
