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