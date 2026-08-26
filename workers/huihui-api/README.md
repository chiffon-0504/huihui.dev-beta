# huihui API Worker

This directory contains the Cloudflare Worker that serves the site's existing API routes. Beta is a named Wrangler environment, while production remains the default deployment target with a separate Worker name.

| Environment | Worker name | Public API base | Deployment entry point |
| --- | --- | --- | --- |
| Beta | `huihui-api-beta` | `https://huihui-api-beta.huihuigames01.workers.dev` | Relevant push to `main` |
| Production | `huihui-api` | `https://api.huihui.dev` | `workflow_dispatch` from `main` with `target=production` |

GitHub Actions supplies deployment credentials. Do not commit secrets.

## GitHub Actions deployment flow

The `Deploy huihui API Worker` workflow keeps the environments explicit and separate:

- A relevant push to `main` runs validation and automatically deploys only the beta Worker.
- Manual workflow dispatch is production-only; beta has no manual deployment entry point that can bypass post-deployment verification.
- Production deploys only when a manual run selects `production` from the `main` branch. The production job references the GitHub environment named `production`.
- Pull requests do not deploy either Worker.

Configure required reviewers and any other deployment protection rules for the `production` environment manually in the GitHub repository settings. Referencing the environment in workflow YAML does not create those rules.

The workflow uses the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets for Wrangler authentication.

## Runtime secrets

Provision the following runtime secrets separately for beta and production in Cloudflare:

- `STEAM_API_KEY`
- `STEAM_ID`
- `TURNSTILE_SECRET_KEY`
- `FORMSPREE_ENDPOINT`

`NASA_API_KEY` is optional; the Worker uses its existing fallback when it is not configured.
