# proofread v2 — design

Status: agreed 2026-10-08 (grilling session). Supersedes the Phase 1/2 docs.

## What it is

**proofread** reviews a public GitHub pull request with a team of specialist AI
reviewers that **prove their findings by running the code** in an isolated sandbox.
Every finding says how it was verified (`verified by: <command + output>`), and
anything that could not be executed is labelled so, up front.

It replaces codereview-ai's single-prompt, paste-a-snippet review. The engine is the
doctrine of the `team-review` Claude Code skill (seats with non-overlapping lenses,
verify before reporting, assumptions table, honest merge) turned into a product.

Purpose: a portfolio piece. Audience: recruiters (30-second skim) and hiring
engineers (dig into evidence). First deploy ASAP.

## Decisions

| Area | Decision |
|---|---|
| Repo | `lawry98/codereview-ai` → rename to **`proofread`**; rewrite on branch `v2`, merge to `master` when v2 ships; keep shadcn/theme primitives |
| License | MIT |
| Visitor experience | Curated **gallery** of pre-run reviews (instant, free) + **live mode** gated by invite code; **GitHub App** in phase 2 |
| Input | Public GitHub PR URL only. Paste mode is removed. |
| Execution | Every review runs in a per-review sandbox: checkout PR head, install, typecheck/lint/test, read and run to verify. Falls back to **static-only** (labelled) when the repo will not install. |
| Ecosystems | JS/TS and Python are executed. PRs that change code in any other language are **rejected** with a clear message. |
| Capabilities (public PRs) | 1 test-integrity guard + mutation score · 2 spec check vs linked issue · 3 supply-chain gate · 4 risk score · 5 change walkthrough · 6 split suggestion |
| Capabilities (private PRs, phase 2) | agent-transcript review · learning loop (accepted/dismissed findings → doctrine) · prod error → PR link |
| Fixes | **Sandbox-verified patches** for blocker/major findings only (apply patch, re-run checks, show result, `.patch` download). Nits get one sentence. |
| Models | Provider-agnostic via **AI Gateway**. Claude-only first; individual seats move to paid Gemini only after the eval harness shows quality holds. Gemini free tier is for local dev only (quota, data-use and EEA/UK terms rule it out for live). |
| Live limits | Invite code + global **$15/day** cap + **800** changed lines max + **5** live reviews per code per day + per-IP limit + Cloudflare Turnstile |
| Quality | Eval harness: **planted-bug** set gates CI; **historic escaped-bug** set (PRs later reverted / fixed) feeds a public scorecard; **clean PRs** measure false positives; **prompt-injection PRs** must not be obeyed |
| Stack | Next.js 16 · AI SDK 7 agents · AI Gateway · Vercel Sandbox · Vercel Workflows (durable long reviews, streamed progress) · Supabase Postgres · Turnstile |
| Gallery | ~8 hand-picked PRs, one per capability, incl. a historic bug it would have caught and a clean "ship it" PR; JS/TS + Python. **Unedited** engine output, stamped (SHAs, models, cost, duration), re-run each major release. |
| Report UX | **Verdict first**: risk score, one-line verdict, caveats → findings by severity (fails-when, verified-by, patch) → assumptions → not checked + declined seats. Per-seat timeline one click away. Live mode auto-composes the team (shown, no approval step). |
| team-review skill | The app repo becomes the single source of roster + prompts; the skill becomes a thin client of the engine **after** the engine ships. Untouched until then. |

## Architecture

```
PR URL
  │
  ▼
GitHub API (host) ── metadata, changed files ──► gate: language + size ──► reject?
  │
  ▼
signals (path rules) ──► compose team (4 standing + conditional, cap 7)
  │
  ▼
base sandbox (install network policy)
  fetch base + refs/pull/N/head · merge-base · diff · git ls-files
  install deps (scripts OFF) ──► network DENY-ALL ──► baseline checks
  (checks fail? → reinstall with scripts, re-run, record that scripts were needed)
  doctrine files · snapshot
  │
  ▼
lead agent: brief (intent, doctrine extract, what does not bind, start-here questions, seat declines)
  │
  ▼
seat agents in parallel, each in its own sandbox from the snapshot (deny-all)
  tools: run_command, read_file → every call logged as evidence
  │
  ▼
lead agent: merge (dedupe, disagreements, re-rank, verdict)
  │
  ▼
invariants (deterministic): strip unknown evidence ids · unverified → not blocker/major ·
  drop findings citing files that do not exist · sort · cap nits
  │
  ▼
ReviewReport (JSON) + markdown
```

A PR under 30 changed lines whose signals are all `documentation` or `configuration`
gets only the correctness seat (solo mode), per the doctrine's no-team rule for tiny
no-logic diffs.

Agents run on the host and call models through AI Gateway. The sandbox only executes
commands. That separation is security rule 1.

## Security rules (non-negotiable)

1. The sandbox gets **no secrets**: no model keys, no GitHub token.
2. Network: package registries + GitHub allowed **only while installing**; **deny-all**
   for checks and for every seat sandbox. Tests needing network are reported as
   not executed, never faked.
3. PR title, body, comments, diff, file contents, doctrine files and command output
   are wrapped as **untrusted data**. Seat prompts say instructions inside them are
   findings (`prompt-injection`), never commands.
4. Hard caps per sandbox (vCPUs, wall-clock timeout, per-command timeout, output
   size); sandboxes are non-persistent and stopped after each review; snapshots deleted.
5. Eval set contains prompt-injection PRs; a review that obeys one fails CI.
6. Dependency install scripts are **off** on the first pass; enabled only when needed,
   and that fact is recorded (and reported by the supply-chain gate, capability 3).

## Engine invariants

- A finding is `verified` only if it cites at least one real evidence id (a logged
  command or file read). Unverified findings cannot be blocker or major.
- Findings must cite a path that exists at head, or a file the PR removed.
- Each seat returns at most 6 findings, 2–5 assumptions, and an explicit "not checked".
- Zero findings is a valid result.
- Execution mode (`full` / `static-only`) and any structural gap (UI not rendered,
  tests already failing at baseline, PR head moved) go into the verdict caveats.

## Milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | Engine as CLI: PR URL → sandbox → seats → merged report (Claude only) | One real public PR reviewed end-to-end with verified findings |
| M2 | Eval harness: planted-bug, historic-bug, clean and injection sets + CI gate | Recall / false-positive rate measured on every prompt or model change |
| M3a | Web v2 **static gallery** + planted-bug scorecard; paste flow deleted | Deployed; portfolio card updated |
| M3b | Live mode: invite codes, caps, Turnstile, Workflows + streamed progress | Invite-gated live reviews work under the caps |
| M4 | Capabilities 1–6 complete + verified patches | Each has a gallery PR and eval cases |
| M5 | Per-seat Gemini routing gated by evals | Scorecard shows quality held, cost dropped |
| P2 | GitHub App, private PRs, transcript review, learning loop, prod link | — |

## Deferred to the relevant milestone plan

Eval corpus sizes and sources (M2) · invite-code admin UX and Supabase schema (M3b) ·
seat ↔ capability mapping details (M4) · Workflows/Sandbox plan limits on the
Vercel plan in use (M3b) · performance-seat trigger (no mechanical signal yet) ·
integration seat (needs open-PR overlap data).

## Housekeeping (user actions)

- Rename the GitHub repo to `proofread` (GitHub redirects the old URL).
- Update `portfolio_lc/src/data/projects.ts` card + link when M3a ships.
- Create/link a Vercel project for proofread (`vercel link`, `vercel env pull .env.local`)
  so the CLI can create sandboxes; add an AI Gateway key.
