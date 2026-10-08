import type { NetworkPolicy } from "@vercel/sandbox";
import type { CommandResult } from "../types";

export type RunOptions = { cwd?: string; timeoutMs?: number; maxOutputBytes?: number };

export interface SandboxRunner {
  /** Runs `cmd` with bash in the repo directory. Never throws: sandbox errors come back as exit code -1. */
  run(cmd: string, opts?: RunOptions): Promise<CommandResult>;
  /** Reads a repo-relative path; null when the file does not exist. */
  readFile(path: string): Promise<string | null>;
  setNetwork(policy: NetworkPolicy): Promise<void>;
  /** Snapshots the filesystem and stops the sandbox. */
  snapshot(): Promise<string>;
  stop(): Promise<void>;
}

export interface SandboxFactory {
  createBase(networkPolicy: NetworkPolicy): Promise<SandboxRunner>;
  /** Seat sandboxes are always created with the locked network policy. */
  fromSnapshot(snapshotId: string): Promise<SandboxRunner>;
  deleteSnapshot(snapshotId: string): Promise<void>;
}
