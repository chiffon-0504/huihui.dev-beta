# Contributing to huihui.dev

Thank you for your interest in huihui.dev. This repository, `huihui.dev-beta`, is the public primary development repository for the site. Changes are developed and validated in beta before they are considered for release to the separate production repository, `huihui.dev-stable`.

## Ways to contribute

Useful contributions include bug fixes, accessibility improvements, documentation, test improvements, localization fixes, frontend improvements, and reliability or security fixes for the Cloudflare Worker APIs. Please open an issue or pull request early for larger changes; not every proposed feature will fit the project's scope or be accepted.

## Development setup

Install the repository's development dependencies with:

```text
npm ci
```

The validation commands defined by this repository are:

```text
npm run check:js
npm run test:unit
npm run test:e2e
npm test
```

Run the checks relevant to your change. `npm test` runs the complete configured check, unit-test, and E2E sequence.

## Contribution workflow

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
