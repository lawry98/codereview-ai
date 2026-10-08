import { describe, expect, it } from "vitest";
import { applyLeadDeclines, composeTeam } from "./compose";

const ids = (team: ReturnType<typeof composeTeam>) => team.seated.map((s) => s.seat.id);

describe("composeTeam", () => {
  it("seats the standing team plus security for a 12-line PR that changes logic", () => {
    const team = composeTeam({ signals: ["security-surface"], changedLines: 12 });
    expect(ids(team)).toEqual(["correctness", "design", "craft", "spec", "security"]);
  });

  it("seats only correctness for a tiny PR that changes no code", () => {
    const team = composeTeam({ signals: ["documentation"], changedLines: 10 });
    expect(ids(team)).toEqual(["correctness"]);
    expect(team.declined).toHaveLength(12);
    expect(team.declined[0].reason).toMatch(/under 30 changed lines and changes no code/);
    expect(ids(composeTeam({ signals: [], changedLines: 10 }))).toEqual(["correctness"]);
  });

  it("seats only correctness for a 3-line tsconfig-only PR", () => {
    const team = composeTeam({ signals: ["configuration"], changedLines: 3 });
    expect(ids(team)).toEqual(["correctness"]);
    expect(team.declined[0].reason).toMatch(/under 30 changed lines and changes no code/);
  });

  it("seats the standing team plus tests for a 29-line PR that changes logic", () => {
    const team = composeTeam({ signals: ["untested-behaviour-change"], changedLines: 29 });
    expect(ids(team)).toEqual(["correctness", "design", "craft", "spec", "tests"]);
  });

  it("seats the four standing seats when no signal fires", () => {
    const team = composeTeam({ signals: [], changedLines: 120 });
    expect(ids(team)).toEqual(["correctness", "design", "craft", "spec"]);
    expect(team.declined).toContainEqual({ seat: "security", reason: "no security-surface signal" });
    expect(team.declined).toContainEqual({ seat: "performance", reason: "no mechanical trigger yet" });
    expect(team.declined.find((d) => d.seat === "integration")?.reason).toMatch(/other open PRs/);
  });

  it("seats conditional seats whose signals fired, saying why", () => {
    const team = composeTeam({ signals: ["security-surface", "untested-behaviour-change"], changedLines: 120 });
    expect(ids(team)).toEqual(["correctness", "design", "craft", "spec", "security", "tests"]);
    expect(team.seated.find((s) => s.seat.id === "tests")?.why).toBe("untested-behaviour-change");
  });

  it("caps the team at seven and declines the overflow by priority", () => {
    const team = composeTeam({
      signals: ["security-surface", "tests-changed", "dependencies", "api-surface", "data-migration"],
      changedLines: 400,
    });
    expect(ids(team)).toEqual(["correctness", "design", "craft", "spec", "security", "tests", "operability"]);
    expect(team.declined.find((d) => d.seat === "api")?.reason).toMatch(/capped at 7/);
  });
});

describe("applyLeadDeclines", () => {
  it("drops conditional seats the lead declined and ignores attempts to drop standing seats", () => {
    const team = composeTeam({ signals: ["security-surface"], changedLines: 120 });
    const after = applyLeadDeclines(team, [
      { seat: "security", reason: "the only match is a variable named token" },
      { seat: "craft", reason: "not needed" },
    ]);
    expect(after.seated.map((s) => s.seat.id)).toEqual(["correctness", "design", "craft", "spec"]);
    expect(after.declined).toContainEqual({ seat: "security", reason: "lead: the only match is a variable named token" });
  });
});
