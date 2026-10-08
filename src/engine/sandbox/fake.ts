import type { NetworkPolicy } from "@vercel/sandbox";
import type { CommandResult } from "../types";
import type { RunOptions, SandboxFactory, SandboxRunner } from "./runner";

export type FakeHandler = (cmd: string, opts: RunOptions) => Partial<Omit<CommandResult, "cmd">> | undefined;

/** Test double: records every command with the network policy in force when it ran. */
export class FakeRunner implements SandboxRunner {
  readonly log: Array<{ cmd: string; network: NetworkPolicy }> = [];
  network: NetworkPolicy;
  stopped = false;

  constructor(
    private readonly options: { handler?: FakeHandler; files?: Record<string, string>; network?: NetworkPolicy; snapshotId?: string } = {},
  ) {
    this.network = options.network ?? "deny-all";
  }

  async run(cmd: string, opts: RunOptions = {}): Promise<CommandResult> {
    this.log.push({ cmd, network: this.network });
    const scripted = this.options.handler?.(cmd, opts) ?? {};
    return { cmd, exitCode: 0, output: "", truncated: false, durationMs: 1, ...scripted };
  }

  async readFile(path: string): Promise<string | null> {
    return this.options.files?.[path] ?? null;
  }

  async setNetwork(policy: NetworkPolicy): Promise<void> {
    this.network = policy;
  }

  async snapshot(): Promise<string> {
    this.stopped = true;
    return this.options.snapshotId ?? "snap_fake";
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  commands(): string[] {
    return this.log.map((entry) => entry.cmd);
  }
}

export class FakeFactory implements SandboxFactory {
  base?: FakeRunner;
  readonly seats: FakeRunner[] = [];
  readonly deleted: string[] = [];

  constructor(private readonly make: { base: (policy: NetworkPolicy) => FakeRunner; seat?: () => FakeRunner }) {}

  async createBase(policy: NetworkPolicy): Promise<SandboxRunner> {
    this.base = this.make.base(policy);
    return this.base;
  }

  async fromSnapshot(): Promise<SandboxRunner> {
    const runner = this.make.seat?.() ?? new FakeRunner();
    this.seats.push(runner);
    return runner;
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    this.deleted.push(snapshotId);
  }
}
