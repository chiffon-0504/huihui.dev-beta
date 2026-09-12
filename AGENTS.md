# huihui.dev repository instructions

This file is the canonical repository policy for project invariants, Git safety,
user-change protection, Fresh baseline, authorization and production safety
boundaries, and high-level validation selection.

## Scope

- Keep changes focused on the requested task.
- Do not modify unrelated pages, languages, styles, scripts, tests, workflows, or deployment configuration.
- Preserve the existing zh-Hant, English, and Japanese structure.
- When changing visible shared content or accessibility labels, check whether all three languages require matching updates.
- Do not change version numbers or release notes unless explicitly requested.

## Git safety

- Inspect the current branch, working tree and relevant diff at task start;
  re-check before Git operations that can affect user state or publication.
  Harmless reads such as `git log`, `git show` and `git diff` do not require
  repeated checkpoints. The fresh baseline and authorization gates below still apply.
- Never overwrite or discard existing user changes.
- Do not commit, push, force-push, create a pull request, merge, deploy, or modify remotes unless explicitly requested.
- The `origin` remote is the beta repository.
- The `stable` remote is the production repository.
- Never push to `stable` unless explicitly instructed to publish.

### Skill authorization boundaries

- Apply explicit user authorization, global AGENTS.md, this repository's
  AGENTS.md, canonical repository release/subsystem documentation, Skills,
  then historical memory/examples, in that order. Loading a Skill grants no
  additional permission; ignore conflicting lower-priority instructions.
- `git push --force-with-lease` is not automatic recovery. A rebase,
  non-fast-forward rejection, stale branch, or failed push does not authorize
  force-push. Require explicit user authorization to force-push the specific
  branch; a general request to publish or replace an experiment is insufficient.
- Without that authorization, stop the affected remote write. Report the
  remote/branch, rejection or divergence, and the exact safe next action:
  obtain force-push authorization for that branch, or publish the verified work
  on a new branch only within the user's authorized scope and the fresh baseline
  policy below. Never force-push stable, even as recovery.

## Fresh baseline requirement

**MUST: No fresh fetch, no branch.**

Before creating any branch, worktree, commit intended for a PR, or PR:

1. Run:

   `git fetch origin`

2. Resolve the latest `origin/main`.

3. Use the freshly fetched `origin/main` as the only valid baseline.

Never use as a PR baseline:

- local `main`
- cached `origin/main`
- task-start HEAD
- a previously recorded SHA
- an unfetched worktree reference

Before continuing, verify and record:

- latest `origin/main` SHA
- latest commit message
- current HEAD SHA
- ahead/behind status

If the work is not based on the current `origin/main`, move or rebase the work
onto the latest baseline before continuing. Do not create a branch until fresh
fetch and baseline verification succeed.

Before a final push or PR creation, run `git fetch origin` again if the task has
run long enough that `main` may have changed. If upstream changed, update the
branch and rerun affected validation. Never silently open a PR from a known-
stale branch.

This is agent policy, not a GitHub enforcement mechanism for human-created
branches.

The policy is mandatory even when the user did not repeat it or a Publish Skill
describes freshness as optional. Perform these gates before the applicable
branch/worktree/PR-commit/PR operation, not after publication. Final publication
checks must confirm freshness still holds; after a required rebase, force-push
still needs the separate branch-specific authorization above. Do not weaken or
bypass Fresh PR base CI or rulesets. Loading a Publish Skill does not impose
publication gates on ordinary read-only analysis or unrelated local edits.

## Release stage boundaries

- The root [Deployment Flow](README.md#deployment-flow) is the sole canonical
  release sequence and defines stage-specific candidate SHA, ancestry, promotion
  and deployment identity checks. Do not substitute a historical Skill's
  universal `origin/main == stable/main` requirement for those stage-specific gates.
- Preserve the verified candidate SHA, merged-PR containment, required CI and
  applicable ancestry/divergence checks for authorized release work; stop on
  unexpected identity or safety-check results. These invariants do not authorize
  publication or replace the canonical sequence.
- Never move or overwrite a conflicting tag. Before accepting an existing tag
  or Release as completed, verify its repository, version/tag name and peeled
  commit match the requested release SHA, plus the requested tag type and Release
  state. Stop on conflict or unverifiable identity. A matching existing artifact
  completes only that artifact's step, not deployment or acceptance gates.

## Wrangler and secret boundaries

- Read `workers/huihui-api/wrangler.toml` and the Worker documentation before
  choosing an environment. Production uses the top-level configuration;
  beta uses `env.beta`. Do not introduce generic `env.staging`/`env.production`.
- Skill loading does not authorize installing or upgrading Wrangler, changing
  manifests/lockfiles, config format, compatibility dates/flags, environments,
  observability, bindings or deployment configuration. Make only changes within
  explicit user authorization; do not execute a Skill's setup checklist by default.
- Do not automatically log in, provision remote Cloudflare resources, deploy or
  dispatch deployment workflows. Each action requires authorization for its
  target. If Wrangler is unavailable, report the limitation and continue work
  that does not require it; do not use an implicit package download as a fallback.
- Never put secret values in shell arguments, examples, `echo`, logs or other
  plaintext command-line forms, including expanded environment variables and
  credential-bearing connection strings. For authorized secret writes, use a
  verified secure prompt, protected file input or a secret-aware integration
  that does not expose values in command lines or output. If unavailable, stop
  that secret write and report the required secure input method.

## Implementation

- Preserve v1's existing HTML/CSS/JavaScript architecture. For v2 tasks, maintain
  the existing Vanilla TypeScript/Vite architecture under `v2/`.
- Prefer the smallest change that fixes the issue.
- Introducing TypeScript into v1, a new framework, build system, dependency or
  broad refactor requires explicit scope and authorization.
- Preserve existing accessibility behavior, responsive layouts, reduced-motion support, language routing, CSP, and security protections.
- Use safe DOM APIs such as `textContent` for external or dynamic text unless trusted markup is specifically required.

## Documentation ownership

Read the applicable owner; keep procedure details there rather than copying them
into this file or Skills. Preserve each subsystem's required documents and contracts.

| Policy or subsystem | Canonical owner |
| --- | --- |
| Git, Fresh baseline, authorization and production safety | This file: [Git safety](#git-safety) and [Fresh baseline](#fresh-baseline-requirement) |
| Release sequence, candidate SHA stages, Pages/Worker ordering and rollout compatibility | Root [Deployment Flow](README.md#deployment-flow) |
| Validation commands and coverage | [CONTRIBUTING.md](CONTRIBUTING.md#validation-coverage) |
| Worker/API requirements | [Worker README](workers/huihui-api/README.md) |
| v2 architecture and local development | [v2 README](v2/README.md) |
| Vendor provenance and CSP verification | [Vendor README](vendor/README.md) and [CSP support documentation](tests/support/csp-enforcement.md) |

## Validation

Choose existing checks that cover the changed behavior and affected contracts;
use [CONTRIBUTING.md](CONTRIBUTING.md#validation-coverage) for command composition
and suite coverage. Do not repeat already-successful unchanged coverage without
a reason. Required CI and applicable security negative controls remain mandatory.
Broaden or repeat validation when failures, shared contracts, browser risk,
security boundaries or unresolved uncertainty justify it.
Run `git diff --check` after edits and never report an unrun check as passed.

## Final report

Report:

- What changed
- Changed files
- Validation performed and results
- Any limitations or remaining risks
