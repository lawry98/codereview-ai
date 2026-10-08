export const SIGNALS = [
  "infra",
  "dependencies",
  "data-migration",
  "tests-changed",
  "user-interface",
  "api-surface",
  "security-surface",
  "configuration",
  "concurrency",
  "documentation",
  "untested-behaviour-change",
] as const;

export type Signal = (typeof SIGNALS)[number];

const TESTS = /(^|\/)(tests?|__tests__|spec)\/|[._-](test|spec)\.[a-z]+$|(^|\/)conftest\.py$|(^|\/)test_[^/]+\.py$/i;
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|vue|svelte)$/i;

const RULES: Array<[Signal, RegExp]> = [
  ["infra", /(^|\/)(dockerfile|docker-compose[^/]*|procfile|makefile|vercel\.json)$|\.github\/workflows\/|\.circleci\/|\.gitlab-ci|\.tf$|(^|\/)(k8s|helm|deploy|infra)\/|\.nix$/i],
  ["dependencies", /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Pipfile(\.lock)?)$/i],
  ["data-migration", /(^|\/)migrations?\/|\.sql$|(^|\/)alembic\/|prisma\/schema|(^|\/)seeds?\//i],
  ["tests-changed", TESTS],
  ["user-interface", /\.(tsx|jsx|vue|svelte|css|scss|sass|less)$|(^|\/)(components?|pages|views|app)\//i],
  ["api-surface", /(^|\/)(api|routes?|handlers?|controllers?|endpoints?|graphql)\/|\.proto$|openapi|swagger|schema\.graphql/i],
  ["security-surface", /auth|crypt|token|session|passw|secret|creden|sanitiz|escape|upload|parse|deserial|pickle|eval|exec|subprocess|shell|sql|cors|csrf|xss/i],
  ["configuration", /(^|\/)(config|settings)|\.env|config\.(ts|js|mjs|cjs|py|json|ya?ml)$/i],
  ["concurrency", /worker|queue|job|cron|thread|async|concurren|mutex|atomic|(^|[/_.-])locks?([/_.-]|$)/i],
  ["documentation", /\.(md|mdx|rst|txt)$|(^|\/)docs?\//i],
];

export function computeSignals(paths: string[]): Signal[] {
  const found = new Set<Signal>();
  for (const [signal, rule] of RULES) if (paths.some((p) => rule.test(p))) found.add(signal);
  // The most useful signal in the set: behaviour moved but nothing tested it.
  if (!found.has("tests-changed") && paths.some((p) => SOURCE.test(p) && !TESTS.test(p))) found.add("untested-behaviour-change");
  return SIGNALS.filter((s) => found.has(s));
}
