import type { NetworkPolicy } from "@vercel/sandbox";

export const REPO_DIR = "/vercel/sandbox/repo";

/** Security rule 2: reachable only while fetching the repo and installing dependencies. */
export const INSTALL_NETWORK: NetworkPolicy = {
  allow: [
    "github.com",
    "codeload.github.com",
    "objects.githubusercontent.com",
    "registry.npmjs.org",
    "registry.yarnpkg.com",
    "repo.yarnpkg.com",
    "pypi.org",
    "files.pythonhosted.org",
  ],
};

/** Baseline checks and every seat sandbox. Tests that need the network fail and are reported, never faked. */
export const LOCKED_NETWORK: NetworkPolicy = "deny-all";

export const SANDBOX_LIMITS = {
  vcpus: 2,
  sandboxTimeoutMs: 30 * 60_000,
  installTimeoutMs: 10 * 60_000,
  checkTimeoutMs: 5 * 60_000,
  commandTimeoutMs: 3 * 60_000,
  defaultOutputBytes: 16_000,
} as const;

/** The only environment a sandbox receives (security rule 1: no secrets). */
export const SANDBOX_ENV: Record<string, string> = {
  CI: "1",
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  PIP_DISABLE_PIP_VERSION_CHECK: "1",
  PYTHONDONTWRITEBYTECODE: "1",
  NO_COLOR: "1",
  FORCE_COLOR: "0",
};
