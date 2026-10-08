import { tool } from "ai";
import { z } from "zod";
import type { EvidenceLog } from "../evidence";
import { SANDBOX_LIMITS } from "../sandbox/policy";
import type { SandboxRunner } from "../sandbox/runner";
import { wrapUntrusted } from "../untrusted";
import { numberLines, shq } from "../util/text";

/** Prints tracked-file changes (porcelain, one per line), then `HEAD <sha>` as the last line. */
const TREE_CHECK = 'git status --porcelain --untracked-files=no; echo "HEAD $(git rev-parse HEAD 2>/dev/null)"';

type TreeState = { files: string[]; head: string | null };

/** `head` is null when the check did not end in a well-formed `HEAD <sha>` line: the tree is then unverified. */
function parseTreeState(output: string): TreeState {
  const lines = output.split("\n").filter((line) => line.trim() !== "");
  const match = /^HEAD ([0-9a-f]{40,64})$/.exec(lines.at(-1) ?? "");
  return match ? { files: lines.slice(0, -1), head: match[1] } : { files: lines, head: null };
}

/** `git status` file names are repo-controlled, so they reach the model only inside wrapUntrusted (security rule 3). */
function describeChange(state: TreeState, headSha: string): string {
  if (state.head === null) {
    return `The working tree could not be verified after this command, so it was reset to the reviewed commit ${headSha.slice(0, 12)}.`;
  }
  const parts: string[] = [];
  if (state.files.length > 0) {
    parts.push(
      `This command modified tracked files:\n${wrapUntrusted("git-status", state.files.join("\n"))}\nA command writing to tracked files is itself worth reporting.`,
    );
  }
  if (state.head !== headSha) {
    parts.push(
      `This command moved HEAD to ${state.head}. To look at another revision without moving HEAD, use \`git show <rev>:<path>\`.`,
    );
  }
  return `${parts.join("\n")}\nThe tree was reset to the reviewed commit ${headSha.slice(0, 12)}.`;
}

export function makeSeatTools(opts: {
  seat: string;
  runner: SandboxRunner;
  evidence: EvidenceLog;
  /** The reviewed commit. Repo code runs in the seat sandbox, so every command is followed by a restore check. */
  headSha: string;
  commandTimeoutMs?: number;
}) {
  return {
    run_command: tool({
      description:
        "Run a bash command in your own isolated copy of the repository at the PR head. There is no network. Use it to run tests or typecheck, grep, `git show <merge-base>:<path>`, or a small script that proves or disproves a claim. Returns an evidenceId to cite in findings.",
      inputSchema: z.object({
        cmd: z.string().describe("The bash command to run"),
        cwd: z.string().optional().describe("Directory relative to the repo root"),
      }),
      execute: async ({ cmd, cwd }) => {
        const result = await opts.runner.run(cmd, { cwd, timeoutMs: opts.commandTimeoutMs ?? SANDBOX_LIMITS.commandTimeoutMs });
        const evidenceId = opts.evidence.recordCommand(opts.seat, result);

        // The command can edit, stage or commit (`git checkout -- .` misses both, and `git status` cannot see a commit),
        // so compare against the reviewed commit and restore it outright when anything differs or cannot be read.
        const state = parseTreeState((await opts.runner.run(TREE_CHECK)).output);
        const modified = state.head !== opts.headSha || state.files.length > 0;
        let note: string | undefined;
        if (modified) {
          const reset = await opts.runner.run(`git reset -q --hard ${shq(opts.headSha)}`);
          note = describeChange(state, opts.headSha);
          if (reset.exitCode !== 0) {
            note = `${note}\nThe tree could not be restored (git reset exit ${reset.exitCode}); later results may reflect the changed tree.`;
          }
        }
        return {
          evidenceId,
          exitCode: result.exitCode,
          truncated: result.truncated,
          output: wrapUntrusted("command-output", result.output),
          ...(note !== undefined ? { note } : {}),
        };
      },
    }),
    read_file: tool({
      description: "Read a file at the PR head with line numbers, up to 400 lines per call. Returns an evidenceId to cite in findings.",
      inputSchema: z.object({
        path: z.string().describe("Repo-relative path"),
        startLine: z.number().optional().describe("First line, 1-based"),
        endLine: z.number().optional().describe("Last line, inclusive"),
      }),
      execute: async ({ path, startLine, endLine }) => {
        let text: string | null;
        try {
          text = await opts.runner.readFile(path);
        } catch {
          return { error: `Could not read ${path} in the PR head.` };
        }
        if (text === null) return { error: `No file at ${path} in the PR head.` };
        const evidenceId = opts.evidence.recordRead(opts.seat, path);
        return { evidenceId, content: wrapUntrusted(`file:${path}`, numberLines(text, startLine, endLine)) };
      },
    }),
  };
}

export type SeatTools = ReturnType<typeof makeSeatTools>;
