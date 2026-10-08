import { describe, expect, it, vi } from "vitest";
import { VercelRunner } from "./vercel";

function stub(runCommand: (...args: unknown[]) => Promise<unknown>) {
  return {
    runCommand: vi.fn(runCommand),
    readFileToBuffer: vi.fn(async ({ path }: { path: string }) => (path === "/vercel/sandbox/repo/src/a.ts" ? Buffer.from("hi") : null)),
    updateNetworkPolicy: vi.fn(async () => undefined),
    snapshot: vi.fn(async () => ({ snapshotId: "snap_1" })),
    stop: vi.fn(async () => undefined),
  };
}

type Stub = ReturnType<typeof stub>;
const runnerFor = (s: Stub) => new VercelRunner(s as unknown as ConstructorParameters<typeof VercelRunner>[0]);

describe("VercelRunner", () => {
  it("runs through bash in the quoted repo directory and returns the unwrapped command", async () => {
    const s = stub(async () => ({ exitCode: 3, output: async () => "boom\n" }));
    const result = await runnerFor(s).run("npm test", { cwd: "pkg", timeoutMs: 1000 });
    expect(s.runCommand).toHaveBeenCalledWith("bash", ["-lc", "cd '/vercel/sandbox/repo/pkg' && npm test"], { timeoutMs: 1000 });
    expect(result).toMatchObject({ cmd: "npm test", exitCode: 3, output: "boom\n", truncated: false });
  });

  it("turns sandbox errors into exit code -1 instead of throwing", async () => {
    const s = stub(async () => {
      throw new Error("sandbox gone");
    });
    const result = await runnerFor(s).run("ls");
    expect(result.exitCode).toBe(-1);
    expect(result.output).toContain("sandbox gone");
  });

  it("reads repo-relative files and returns null for missing ones", async () => {
    const runner = runnerFor(stub(async () => ({})));
    expect(await runner.readFile("src/a.ts")).toBe("hi");
    expect(await runner.readFile("nope.ts")).toBeNull();
  });

  it("returns the snapshot id", async () => {
    expect(await runnerFor(stub(async () => ({}))).snapshot()).toBe("snap_1");
  });
});
