import { describe, expect, it } from "vitest";
import { detectProject } from "./detect";

function project(files: Record<string, string>, extraRoot: string[] = []) {
  return detectProject({ rootFiles: [...Object.keys(files), ...extraRoot], read: (p) => files[p] ?? null });
}

describe("detectProject — node", () => {
  it("uses npm ci with scripts off and runs the known scripts", () => {
    const info = project({
      "package.json": JSON.stringify({ scripts: { typecheck: "tsc", lint: "eslint .", test: "vitest run", deploy: "rm -rf /" } }),
      "package-lock.json": "{}",
    });
    expect(info.installs).toEqual([
      { ecosystem: "node", label: "npm ci", safe: "npm ci --ignore-scripts --no-audit --no-fund", withScripts: "npm ci --no-audit --no-fund" },
    ]);
    expect(info.checks).toEqual([
      { name: "typecheck", ecosystem: "node", cmd: "npm run --silent typecheck" },
      { name: "lint", ecosystem: "node", cmd: "npm run --silent lint" },
      { name: "test", ecosystem: "node", cmd: "npm run --silent test" },
    ]);
  });

  it("detects pnpm from its lockfile", () => {
    const info = project({ "package.json": JSON.stringify({ scripts: { test: "vitest" } }), "pnpm-lock.yaml": "" });
    expect(info.installs[0].safe).toBe("corepack enable && pnpm install --frozen-lockfile --ignore-scripts");
    expect(info.checks).toEqual([{ name: "test", ecosystem: "node", cmd: "pnpm run --silent test" }]);
  });

  it("detects yarn berry", () => {
    const info = project({ "package.json": "{}", "yarn.lock": "", ".yarnrc.yml": "" });
    expect(info.installs[0]).toMatchObject({ safe: "corepack enable && yarn install --immutable --mode=skip-build", withScripts: "corepack enable && yarn install --immutable" });
  });

  it("skips npm's placeholder test script and falls back to tsc when there is a tsconfig", () => {
    const info = project({ "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }), "tsconfig.json": "{}" });
    expect(info.installs[0].label).toBe("npm install");
    expect(info.checks).toEqual([{ name: "typecheck", ecosystem: "node", cmd: "npx --no-install tsc --noEmit" }]);
  });

  it("notes invalid package.json instead of throwing", () => {
    const info = project({ "package.json": "{nope" });
    expect(info.installs).toEqual([]);
    expect(info.notes.join("\n")).toMatch(/package\.json is not valid JSON/);
  });
});

describe("detectProject — python", () => {
  it("installs requirements binary-only first and finds pytest", () => {
    const info = project({ "requirements.txt": "pytest==8.0\n", "requirements-dev.txt": "ruff\n" });
    expect(info.installs).toEqual([
      {
        ecosystem: "python",
        label: "pip install -r",
        safe: "python3 -m venv .venv && .venv/bin/pip install -q --only-binary=:all: -r 'requirements-dev.txt' -r 'requirements.txt'",
        withScripts: "python3 -m venv .venv && .venv/bin/pip install -q -r 'requirements-dev.txt' -r 'requirements.txt'",
      },
    ]);
    expect(info.checks).toEqual([{ name: "test", ecosystem: "python", cmd: ".venv/bin/python -m pytest -q -p no:cacheprovider" }]);
  });

  it("uses uv when there is a uv.lock and reads ruff/mypy config", () => {
    const info = project({ "pyproject.toml": "[tool.ruff]\n[tool.mypy]\n[project]\ndependencies=['pytest']\n", "uv.lock": "" });
    expect(info.installs[0].label).toBe("uv sync");
    expect(info.installs[0].safe.endsWith("uv sync --frozen --all-extras --no-build")).toBe(true);
    expect(info.checks.map((c) => c.name)).toEqual(["typecheck", "lint", "test"]);
  });

  it("detects both ecosystems", () => {
    const info = project({ "package.json": "{}", "pyproject.toml": "[project]\n" }, ["tests"]);
    expect(info.installs.map((i) => i.ecosystem)).toEqual(["node", "python"]);
    expect(info.checks).toEqual([{ name: "test", ecosystem: "python", cmd: ".venv/bin/python -m pytest -q -p no:cacheprovider" }]);
  });

  it("notes when there is nothing to install", () => {
    expect(project({}).notes.join("\n")).toMatch(/nothing was installed/);
  });
});
