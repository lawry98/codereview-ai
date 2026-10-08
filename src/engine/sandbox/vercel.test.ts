import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTALL_NETWORK, REPO_DIR, SANDBOX_ENV } from "./policy";
import { VercelRunner, createVercelSandboxFactory } from "./vercel";

const mocks = vi.hoisted(() => ({
  create: vi.fn<(params: Record<string, unknown>) => Promise<unknown>>(),
  snapshotGet: vi.fn<(params: Record<string, unknown>) => Promise<unknown>>(),
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: { create: mocks.create },
  Snapshot: { get: mocks.snapshotGet },
}));

type SandboxLike = ConstructorParameters<typeof VercelRunner>[0];

const finished = { exitCode: 0, output: async () => "" };

function stub(runCommand: SandboxLike["runCommand"] = async () => finished) {
  return {
    runCommand: vi.fn(runCommand),
    readFileToBuffer: vi.fn(async ({ path }: { path: string }) => (path === "/vercel/sandbox/repo/src/a.ts" ? Buffer.from("hi") : null)),
    updateNetworkPolicy: vi.fn(async () => undefined),
    snapshot: vi.fn(async () => ({ snapshotId: "snap_1" })),
    stop: vi.fn(async () => undefined),
  };
}

describe("VercelRunner", () => {
  it("runs through bash in the quoted repo directory and returns the unwrapped command", async () => {
    const s = stub(async () => ({ exitCode: 3, output: async () => "boom\n" }));
    const result = await new VercelRunner(s).run("npm test", { cwd: "pkg", timeoutMs: 1000 });
    expect(s.runCommand).toHaveBeenCalledWith("bash", ["-lc", "cd '/vercel/sandbox/repo/pkg' && npm test"], { timeoutMs: 1000 });
    expect(result).toMatchObject({ cmd: "npm test", exitCode: 3, output: "boom\n", truncated: false });
  });

  it("turns sandbox errors into exit code -1 instead of throwing", async () => {
    const s = stub(async () => {
      throw new Error("sandbox gone");
    });
    const result = await new VercelRunner(s).run("ls");
    expect(result.exitCode).toBe(-1);
    expect(result.output).toContain("sandbox gone");
  });

  it("reads repo-relative files and returns null for missing ones", async () => {
    const runner = new VercelRunner(stub());
    expect(await runner.readFile("src/a.ts")).toBe("hi");
    expect(await runner.readFile("nope.ts")).toBeNull();
  });

  it("returns the snapshot id", async () => {
    expect(await new VercelRunner(stub()).snapshot()).toBe("snap_1");
  });
});

describe("createVercelSandboxFactory security invariants", () => {
  const token = "tok_fake_vercel_token";
  const teamId = "team_fake_id";
  const projectId = "prj_fake_id";
  const apiKey = "sk-ant-fake-api-key";
  const hostOnly = "sk-ant-fake-from-process-env";
  const env = { VERCEL_TOKEN: token, VERCEL_TEAM_ID: teamId, VERCEL_PROJECT_ID: projectId, ANTHROPIC_API_KEY: apiKey };

  function createParams(): Record<string, unknown> {
    const call = mocks.create.mock.calls[0];
    if (!call) throw new Error("Sandbox.create was not called");
    return call[0];
  }

  /** The sandbox env handed to `Sandbox.create`, which must be exactly SANDBOX_ENV and carry no host secret. */
  function expectCleanEnv(params: Record<string, unknown>) {
    expect(params.env).toEqual(SANDBOX_ENV);
    const serialized = JSON.stringify(params.env);
    for (const secret of [token, teamId, projectId, apiKey, hostOnly]) expect(serialized).not.toContain(secret);
  }

  beforeEach(() => {
    mocks.create.mockReset();
    mocks.snapshotGet.mockReset();
    mocks.create.mockResolvedValue(stub());
    // A secret in the host process must not leak into sandboxes either.
    vi.stubEnv("ANTHROPIC_API_KEY", hostOnly);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("createBase uses the policy it is given, SANDBOX_ENV only, non-persistent, and API credentials outside env", async () => {
    await createVercelSandboxFactory(env).createBase(INSTALL_NETWORK);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const params = createParams();
    expect(params.networkPolicy).toBe(INSTALL_NETWORK);
    expect(params.persistent).toBe(false);
    expect(params).toMatchObject({ token, teamId, projectId, image: "vercel/sandbox/universal" });
    expectCleanEnv(params);
  });

  it("createBase creates the repo directory in the new sandbox", async () => {
    const sandbox = stub();
    mocks.create.mockResolvedValue(sandbox);
    await createVercelSandboxFactory(env).createBase(INSTALL_NETWORK);
    expect(sandbox.runCommand).toHaveBeenCalledWith("mkdir", ["-p", REPO_DIR]);
  });

  it("fromSnapshot is always deny-all, from that snapshot, with SANDBOX_ENV only and non-persistent", async () => {
    await createVercelSandboxFactory(env).fromSnapshot("snap_x");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const params = createParams();
    expect(params.networkPolicy).toBe("deny-all");
    expect(params.source).toEqual({ type: "snapshot", snapshotId: "snap_x" });
    expect(params.persistent).toBe(false);
    expect(params).toMatchObject({ token, teamId, projectId });
    expectCleanEnv(params);
  });

  it("keeps host secrets out of sandbox env when it falls back to process.env and OIDC auth", async () => {
    await createVercelSandboxFactory().fromSnapshot("snap_x");
    const params = createParams();
    expect(params.networkPolicy).toBe("deny-all");
    expect(params).not.toHaveProperty("token");
    expectCleanEnv(params);
  });

  it("deletes a snapshot looked up with the API credentials", async () => {
    const deleteSnapshot = vi.fn(async () => undefined);
    mocks.snapshotGet.mockResolvedValue({ delete: deleteSnapshot });
    await createVercelSandboxFactory(env).deleteSnapshot("snap_x");
    expect(mocks.snapshotGet).toHaveBeenCalledWith({ snapshotId: "snap_x", token, teamId, projectId });
    expect(deleteSnapshot).toHaveBeenCalledTimes(1);
  });
});
