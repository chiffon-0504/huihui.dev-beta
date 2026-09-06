# huihui.dev repository instructions

## Scope

- Keep changes focused on the requested task.
- Do not modify unrelated pages, languages, styles, scripts, tests, workflows, or deployment configuration.
- Preserve the existing zh-Hant, English, and Japanese structure.
- When changing visible shared content or accessibility labels, check whether all three languages require matching updates.
- Do not change version numbers or release notes unless explicitly requested.

## Git safety

- Inspect `git status`, the current branch, and the relevant diff before editing.
- Never overwrite or discard existing user changes.
- Do not commit, push, force-push, create a pull request, merge, deploy, or modify remotes unless explicitly requested.
- The `origin` remote is the beta repository.
- The `stable` remote is the production repository.
- Never push to `stable` unless explicitly instructed to publish.

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

## Implementation

- Follow the existing HTML, CSS, and JavaScript architecture.
- Prefer the smallest change that fixes the issue.
- Do not introduce TypeScript, frameworks, build tools, dependencies, or broad refactors unless explicitly requested.
- Preserve existing accessibility behavior, responsive layouts, reduced-motion support, language routing, CSP, and security protections.
- Use safe DOM APIs such as `textContent` for external or dynamic text unless trusted markup is specifically required.

## Validation

After relevant changes, run the existing applicable checks:

- `npm run check:js`
- `npm run test:unit`
- `npm run test:e2e`
- `npm test`
- `git diff --check`

Run only the checks relevant to the task unless a full validation run is requested.

## Final report

Report:

- What changed
- Changed files
- Validation performed and results
- Any limitations or remaining risks
