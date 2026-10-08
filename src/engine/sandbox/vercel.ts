import { posix } from "node:path";
import { Sandbox, Snapshot, type NetworkPolicy } from "@vercel/sandbox";
import type { CommandResult } from "../types";
import { shq, tailBytes } from "../util/text";
import { LOCKED_NETWORK, REPO_DIR, SANDBOX_ENV, SANDBOX_LIMITS } from "./policy";
import type { RunOptions, SandboxFactory, SandboxRunner } from "./runner";

type SandboxLike = Pick<Sandbox, "runCommand" | "readFileToBuffer" | "updateNetworkPolicy" | "snapshot" | "stop">;

export class VercelRunner implements SandboxRunner {
  constructor(private readonly sandbox: SandboxLike) {}

  async run(cmd: string, opts: RunOptions = {}): Promise<CommandResult> {
    const started = Date.now();
    const dir = opts.cwd ? posix.join(REPO_DIR, opts.cwd) : REPO_DIR;
    try {
      // On timeout the SDK kills the process with SIGKILL and returns its exit code.
      const finished = await this.sandbox.runCommand("bash", ["-lc", `cd ${shq(dir)} && ${cmd}`], {
        timeoutMs: opts.timeoutMs ?? SANDBOX_LIMITS.commandTimeoutMs,
      });
      const { text, truncated } = tailBytes(await finished.output("both"), opts.maxOutputBytes ?? SANDBOX_LIMITS.defaultOutputBytes);
      return { cmd, exitCode: finished.exitCode, output: text, truncated, durationMs: Date.now() - started };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { cmd, exitCode: -1, output: `[proofread] sandbox error: ${message}`, truncated: false, durationMs: Date.now() - started };
    }
  }

  async readFile(path: string): Promise<string | null> {
    const buffer = await this.sandbox.readFileToBuffer({ path: posix.join(REPO_DIR, path) });
    return buffer ? buffer.toString("utf8") : null;
  }

  async setNetwork(policy: NetworkPolicy): Promise<void> {
    await this.sandbox.updateNetworkPolicy(policy);
  }

  async snapshot(): Promise<string> {
    const snapshot = await this.sandbox.snapshot();
    return snapshot.snapshotId;
  }

  async stop(): Promise<void> {
    await this.sandbox.stop();
  }
}

/** Access-token auth for non-Vercel environments; otherwise the SDK uses VERCEL_OIDC_TOKEN from `vercel env pull`. */
function credentials(env: NodeJS.ProcessEnv) {
  const { VERCEL_TOKEN: token, VERCEL_TEAM_ID: teamId, VERCEL_PROJECT_ID: projectId } = env;
  return token && teamId && projectId ? { token, teamId, projectId } : {};
}

export function createVercelSandboxFactory(env: NodeJS.ProcessEnv = process.env): SandboxFactory {
  const creds = credentials(env);
  const common = {
    resources: { vcpus: SANDBOX_LIMITS.vcpus },
    timeout: SANDBOX_LIMITS.sandboxTimeoutMs,
    persistent: false,
    env: SANDBOX_ENV,
    tags: { app: "proofread" },
    ...creds,
  };
  return {
    async createBase(networkPolicy) {
      const sandbox = await Sandbox.create({ ...common, image: "vercel/sandbox/universal", networkPolicy });
      await sandbox.runCommand("mkdir", ["-p", REPO_DIR]);
      return new VercelRunner(sandbox);
    },
    async fromSnapshot(snapshotId) {
      const sandbox = await Sandbox.create({ ...common, source: { type: "snapshot", snapshotId }, networkPolicy: LOCKED_NETWORK });
      return new VercelRunner(sandbox);
    },
    async deleteSnapshot(snapshotId) {
      const snapshot = await Snapshot.get({ snapshotId, ...creds });
      await snapshot.delete();
    },
  };
}
