import { describe, expect, it } from "vitest";
import { EvidenceLog } from "./evidence";

const result = (cmd: string, output = "ok") => ({ cmd, exitCode: 0, output, truncated: false, durationMs: 5 });

describe("EvidenceLog", () => {
  it("numbers entries per seat", () => {
    const log = new EvidenceLog();
    expect(log.recordCommand("correctness", result("npm test"))).toBe("correctness-1");
    expect(log.recordRead("craft", "src/a.ts")).toBe("craft-1");
    expect(log.recordRead("correctness", "src/b.ts")).toBe("correctness-2");
    expect(log.all().map((e) => e.id)).toEqual(["correctness-1", "craft-1", "correctness-2"]);
  });
  it("stores commands and reads", () => {
    const log = new EvidenceLog();
    const id = log.recordCommand("tests", result("npx vitest run", "1 failed"));
    expect(log.get(id)).toEqual({ id, seat: "tests", kind: "command", cmd: "npx vitest run", exitCode: 0, output: "1 failed", durationMs: 5 });
    expect(log.has(id)).toBe(true);
    expect(log.has("tests-99")).toBe(false);
  });
  it("keeps only the tail of long output", () => {
    const log = new EvidenceLog();
    const id = log.recordCommand("tests", result("x", `${"a".repeat(10_000)}\nlast line\n`));
    const entry = log.get(id);
    expect(entry?.kind === "command" && entry.output.endsWith("last line\n")).toBe(true);
    expect(entry?.kind === "command" && entry.output.length < 5_000).toBe(true);
  });
});
