# Contributing to huihui.dev

Thank you for your interest in huihui.dev. This repository, `huihui.dev-beta`, is the public primary development repository for the site. Changes are developed and validated in beta before they are considered for release to the separate production repository, `huihui.dev-stable`.

## Ways to contribute

Useful contributions include bug fixes, accessibility improvements, documentation, test improvements, localization fixes, frontend improvements, and reliability or security fixes for the Cloudflare Worker APIs. Please open an issue or pull request early for larger changes; not every proposed feature will fit the project's scope or be accepted.

## Development setup

Install the repository's development dependencies with:

```text
npm ci
```

## Validation coverage

This section is the canonical catalog of validation commands and their coverage.
Repository-wide [selection principles](AGENTS.md#validation) and
[authorization rules](AGENTS.md#git-safety) belong to AGENTS.md; subsystem documents
own their specific contracts.

Choose existing checks covering the changed behavior and affected contracts.
The entries below describe coverage, not a checklist to run for every change.

| Existing command or suite | Coverage |
| --- | --- |
| `npm run check:js` | Configured JavaScript syntax checks for v1 browser code and the API Worker. |
| `npm run test:unit` | Unit and static contracts, including the existing v2 unit contracts. |
| `npm run test:e2e` | Default local Chromium E2E suite in `playwright.config.mjs`. |
| `npm test` | Runs `check:js`, `test:unit`, then `test:e2e`; it does not include every validation surface below. |
| `npm run check:ts` | v2 TypeScript checking. |
| `npm run build:v2` | Includes `check:ts`, then builds v2 with Vite. |
| `npm run test:e2e:v2` | Includes `build:v2`, then v2 Chromium, Firefox and WebKit tests; see [v2 guidance](v2/README.md). |
| Cross-browser critical | Separate Firefox/WebKit subset via [playwright.cross-browser.config.mjs](playwright.cross-browser.config.mjs). |
| Full-compatible | Separate Firefox/WebKit coverage via [playwright.full-cross-browser.config.mjs](playwright.full-cross-browser.config.mjs), with that config's existing exclusions. |
| Live beta smoke | Separate deployment checks in [Beta CD](.github/workflows/beta-cd.yml); local E2E does not prove live deployment identity or behavior. |

After a successful `npm test`, do not immediately rerun its unchanged subcommands
without a reason. The same coverage accounting applies to the nested v2 commands.
Broaden or repeat validation when failures, shared contracts, browser risk,
security boundaries or unresolved uncertainty justify it; record the reason and
observed results. Required CI and applicable security negative controls remain
mandatory. For CSP work, follow the [enforcement verification guidance](tests/support/csp-enforcement.md),
including enforcing, Report-Only and no-CSP controls.

Use `git diff --check` as the normal post-edit whitespace check. Report checks
actually run and any limits on their coverage; never report an unrun check as
passed. Validation guidance does not authorize deployments or new external writes.

## Contribution workflow

For agent-assisted work, the canonical [Git safety](AGENTS.md#git-safety) and
[Fresh baseline](AGENTS.md#fresh-baseline-requirement) policies apply; the human
fork workflow below does not replace those requirements or grant agent write
authorization. Authorized release work follows the root [Deployment Flow](README.md#deployment-flow).

1. Fork this repository.
2. Create a branch from `main` in your fork.
3. Make a focused change that fits the project's scope.
4. Run the relevant validation commands.
5. Push your branch to your fork.
6. Open a pull request against this repository's `main` branch.

The `main` branch is protected, so changes should come through pull requests rather than direct pushes.

### Branch and commit guidance

Use a descriptive branch name. The existing repository convention commonly uses prefixes such as `feat/`, `fix/`, `docs/`, `test/`, and `refactor/`. Keep commits focused and use a concise conventional-style subject where practical, for example `docs: clarify contributor workflow`.

## Pull-request expectations

Pull requests should:

- have a focused scope and clearly describe the intent;
- include relevant tests or checks when behavior changes;
- keep documentation synchronized with the behavior it describes;
- pass the required CI checks; and
- address review findings before merge.

## Multilingual changes

The site supports ZH / EN / JA through path-based routing. Shared layout behavior is injected from `js/layout.js`, while localized content is organized in `js/locales/zh.js`, `js/locales/en.js`, and `js/locales/ja.js`. Localized pages use the root-language routes alongside corresponding `en/` and `ja/` paths.

When changing user-facing localized content, check the corresponding locale keys or pages in all three languages. Do not leave languages inconsistently updated unless the pull request explicitly explains why a translation is intentionally deferred.

## Security and production boundaries

- Do not commit credentials, API tokens, secrets, private keys, or other sensitive material.
- Do not include production secrets or sensitive vulnerability details in issues or pull requests.
- Do not attempt to modify production infrastructure as part of an ordinary contribution.
- Do not assume access to `huihui.dev-stable` or production Cloudflare resources.

## Licensing and assets

Source code is licensed under the MIT License. Images, photographs, artwork, and other media assets are excluded unless otherwise stated. Only submit assets that you have permission to contribute and that can be distributed with the project under the applicable terms.
