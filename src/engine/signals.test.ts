import { describe, expect, it } from "vitest";
import { computeSignals } from "./signals";

describe("computeSignals", () => {
  it("flags untested source changes", () => {
    expect(computeSignals(["src/price.ts"])).toEqual(["untested-behaviour-change"]);
  });
  it("does not flag untested when tests moved too (pytest naming)", () => {
    expect(computeSignals(["pkg/service.py", "tests/test_service.py"])).toEqual(["tests-changed"]);
  });
  it("detects dependencies without matching words that merely contain 'lock'", () => {
    expect(computeSignals(["package.json", "src/clock.ts"])).toEqual(["dependencies", "untested-behaviour-change"]);
  });
  it("detects concurrency from a lock module", () => {
    expect(computeSignals(["src/lock.ts"])).toContain("concurrency");
  });
  it("still detects lock and locks as a path segment or basename stem", () => {
    expect(computeSignals(["src/locks/pool.ts", "lib/lock/index.ts"])).toEqual(["concurrency", "untested-behaviour-change"]);
  });
  it.each(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "uv.lock"])("lockfile %s signals dependencies only", (lockfile) => {
    expect(computeSignals([lockfile])).toEqual(["dependencies"]);
  });
  it("detects security, api and ui surfaces", () => {
    expect(computeSignals(["src/api/auth/session.tsx"])).toEqual(["user-interface", "api-surface", "security-surface", "untested-behaviour-change"]);
  });
  it("detects infra, migrations (SQL is also a security surface), configuration and docs", () => {
    expect(computeSignals([".github/workflows/ci.yml", "db/migrations/001.sql", "config/settings.json", "docs/guide.md"])).toEqual([
      "infra",
      "data-migration",
      "security-surface",
      "configuration",
      "documentation",
    ]);
  });
});
