import type { ChangedFile, Ecosystem } from "./types";

const NODE_CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|svelte)$/i;
const PYTHON_CODE = /\.(py|pyi)$/i;
const NODE_MANIFEST = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json)$/i;
const PYTHON_MANIFEST = /(^|\/)(pyproject\.toml|requirements[^/]*\.txt|uv\.lock|poetry\.lock|setup\.py|setup\.cfg|Pipfile(\.lock)?)$/i;
const OTHER_CODE = /\.(go|rs|java|kt|kts|scala|swift|m|mm|rb|php|cs|fs|c|h|cc|cpp|cxx|hpp|ex|exs|erl|hs|lua|dart|zig|r|jl|clj|ml|sh|bash|zsh|ps1|pl|pm|groovy|gradle|sol|vb|coffee|pyx|asm|s)$/i;

export type GateResult = { ok: true; ecosystems: Ecosystem[]; changedLines: number } | { ok: false; reason: string };

export function changedLineCount(files: ChangedFile[]): number {
  return files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
}

export function gatePr(files: ChangedFile[], opts: { maxChangedLines: number }): GateResult {
  if (files.length === 0) return { ok: false, reason: "This pull request has no changed files." };

  const changedLines = changedLineCount(files);
  if (changedLines > opts.maxChangedLines) {
    return {
      ok: false,
      reason: `This pull request changes ${changedLines} lines; the limit is ${opts.maxChangedLines}. A diff that size cannot be reviewed honestly; split it into smaller PRs.`,
    };
  }

  const other = new Set(files.filter((f) => OTHER_CODE.test(f.path)).map((f) => f.path.slice(f.path.lastIndexOf(".")).toLowerCase()));
  if (other.size > 0) {
    return { ok: false, reason: `proofread executes JS/TS and Python only; this pull request changes ${[...other].sort().join(", ")} files.` };
  }

  const ecosystems: Ecosystem[] = [];
  if (files.some((f) => NODE_CODE.test(f.path) || NODE_MANIFEST.test(f.path))) ecosystems.push("node");
  if (files.some((f) => PYTHON_CODE.test(f.path) || PYTHON_MANIFEST.test(f.path))) ecosystems.push("python");
  if (ecosystems.length === 0) {
    return { ok: false, reason: "This pull request changes no JS/TS or Python code, so there is nothing to execute." };
  }
  return { ok: true, ecosystems, changedLines };
}
