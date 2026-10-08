import type { Signal } from "./signals";

export type SeatId =
  | "correctness"
  | "design"
  | "craft"
  | "spec"
  | "security"
  | "tests"
  | "operability"
  | "api"
  | "data"
  | "concurrency"
  | "a11y"
  | "performance"
  | "integration";

export type SeatDefinition = {
  id: SeatId;
  name: string;
  standing: boolean;
  triggers: Signal[];
  lens: string;
  notThisSeat: string;
  highestYield: string;
  /** A structural gap this seat cannot close yet; it is carried into the verdict whenever one of its triggers fires or the seat runs. */
  caveat?: string;
  /** Why the seat cannot run yet; it is always declined with this reason. */
  unavailable?: string;
};

export const MAX_TEAM = 7;

export const ROSTER: SeatDefinition[] = [
  {
    id: "correctness",
    name: "Correctness",
    standing: true,
    triggers: [],
    lens: "Does this code do what it says, on every input it can actually receive? Boundaries, empty and single-element cases, null and undefined, unicode, timezone and DST, concurrent callers, error paths, resource cleanup, off-by-ones, and the branch nobody ran.",
    notThisSeat: "Style, naming, architecture, test quality. Those have owners.",
    highestYield: "Find the code path the author clearly ran, then find the sibling path they clearly did not, and run it.",
  },
  {
    id: "design",
    name: "Design & seams",
    standing: true,
    triggers: [],
    lens: "Is this the right shape? Where module boundaries fall, whether a new abstraction earns itself, whether the change is spread across files that must all move together, whether an interface is deeper than the implementation it hides. Challenge the premise: does this need to exist, and is there a smaller change with the same outcome?",
    notThisSeat: "Individual bugs, formatting, test assertions.",
    highestYield: "Ask what the next three changes to this area will look like. A shape that makes this change easy and the next three hard is the expensive kind of wrong.",
  },
  {
    id: "craft",
    name: "Craft: comments, naming, succinctness",
    standing: true,
    triggers: [],
    lens: "Every comment the diff adds or leaves behind, every name it introduces, every line that could be deleted without loss. For each comment: is it still true, does it say something the code cannot, does it explain why? The usual fix for a bad comment is deletion, not expansion; recommend a new comment only where you can name what a future reader would otherwise get wrong. Also: dead code, commented-out code, unused parameters, leftover debugging, ownerless TODOs, redundant variables.",
    notThisSeat: "Bugs, security, architecture.",
    highestYield: "Read the changed files top to bottom as a newcomer, not as a diff. Diffs hide that a file has become incoherent.",
  },
  {
    id: "spec",
    name: "Spec & conventions",
    standing: true,
    triggers: [],
    lens: "Does the change do what it was asked to do (per the PR description), no less and no more? Does it do it the way this repo does things: the conventions written in its docs and the ones merely practised in the surrounding code? You own the doctrine check.",
    notThisSeat: "Anything a linter or formatter already enforces.",
    highestYield: "Find the nearest existing code that solves a similar problem and ask why this change did not follow it.",
  },
  {
    id: "security",
    name: "Security & hostile input",
    standing: false,
    triggers: ["security-surface"],
    lens: "Assume every input is attacker-chosen. Injection, path traversal, SSRF, prototype pollution, deserialization, resource exhaustion on malformed input, timing leaks, secrets in logs or errors, authorization checked on one path but not its sibling, trust boundaries the change moved.",
    notThisSeat: "General correctness and style.",
    highestYield: "Write the hostile input and run it against the changed function.",
  },
  {
    id: "tests",
    name: "Test quality",
    standing: false,
    triggers: ["tests-changed", "untested-behaviour-change"],
    lens: "Not coverage percentage: would these tests fail if the code were wrong? Hunt vacuous assertions, tests that assert the implementation rather than behaviour, mocks so complete only the mock is tested, loose matchers, shared mutable state. Then the inverse: which behaviours in this diff have no test, and which of those matter. Say plainly when the honest answer is that something does not need a test. In this version you cannot edit files, so you cannot mutate the code; judge by running the tests and reading assertions against the code, and say in notChecked that no mutation testing was done.",
    notThisSeat: "Production-code bugs that no test is involved in.",
    highestYield: "Run the changed tests, then find the assertion that would still pass if the changed line were reverted.",
  },
  {
    id: "operability",
    name: "Release & operability",
    standing: false,
    triggers: ["infra", "configuration", "dependencies"],
    lens: "What happens at 3am. Is the failure visible (log, metric, alert)? Retryable, idempotent, bounded (timeouts, limits, backoff)? Can it be rolled back? New env vars: documented, and what happens when one is missing? New dependency: what it pulls in, who maintains it, what it does at install time.",
    notThisSeat: "Code style and in-process correctness.",
    highestYield: "Trace what the change does when its new dependency, env var or external call is missing or slow.",
  },
  {
    id: "api",
    name: "API & contract",
    standing: false,
    triggers: ["api-surface"],
    lens: "What breaks for a caller who does not update. Removed or narrowed fields, changed defaults, error shapes, nullability, ordering, pagination. Versioning and deprecation path. Whether the contract is documented where a consumer would find it.",
    notThisSeat: "Internal implementation details invisible to callers.",
    highestYield: "Find every caller of the changed export in the repo and check each one still holds.",
  },
  {
    id: "data",
    name: "Data & migrations",
    standing: false,
    triggers: ["data-migration"],
    lens: "Is it reversible? Does it lock a table long enough to matter? Does it run before or after the code that depends on it, and does the intermediate state work? Backfill on large tables, constraints against existing rows, data loss obvious only in hindsight.",
    notThisSeat: "Application logic unrelated to stored data.",
    highestYield: "Describe the database state halfway through the deploy and check the old and new code both survive it.",
  },
  {
    id: "concurrency",
    name: "Concurrency & state",
    standing: false,
    triggers: ["concurrency"],
    lens: "Interleavings. Check-then-use races, lost updates, deadlock ordering, unbounded queues, cancellation and cleanup, non-idempotent retries, state correct on one instance and wrong on three.",
    notThisSeat: "Single-threaded logic errors.",
    highestYield: "Write down two concurrent callers and step through them line by line.",
  },
  {
    id: "a11y",
    name: "Accessibility & UX",
    standing: false,
    triggers: ["user-interface"],
    lens: "Keyboard reachability and focus order, focus visibility, semantic elements and roles, labels and names, live-region announcements, colour contrast, motion under prefers-reduced-motion, touch target size. Be concrete about what fails and at what measurement.",
    notThisSeat: "Business logic behind the UI.",
    highestYield: "Read the rendered markup the component produces and walk it with a keyboard in your head.",
    caveat: "The UI was not rendered in a browser, so layout, contrast, focus rings and motion were not checked.",
  },
  {
    id: "performance",
    name: "Performance",
    standing: false,
    triggers: [],
    lens: "Complexity that grows with data that grows, repeated work that could be hoisted, allocation in loops, blocking calls on an event loop, added bundle weight. Insist on a measurement or a clearly reasoned bound.",
    notThisSeat: "Micro-optimisations without a measurement.",
    highestYield: "Measure the changed function at 10x the input size.",
  },
  {
    id: "integration",
    name: "Integration & blast radius",
    standing: false,
    triggers: [],
    lens: "The seams between this change and everything around it: callers not updated, assumptions another subsystem just lost, overlap with other open PRs.",
    notThisSeat: "Anything inside the diff that another seat owns.",
    highestYield: "List the open PRs touching the same files.",
    unavailable: "needs data about other open PRs, which proofread does not collect yet",
  },
];

export function seatById(id: string): SeatDefinition | undefined {
  return ROSTER.find((seat) => seat.id === id);
}
