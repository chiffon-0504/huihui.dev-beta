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
- Pull requests run validation but do not deploy either Worker.

Configure required reviewers and any other deployment protection rules for the `production` environment manually in the GitHub repository settings. Referencing the environment in workflow YAML does not create those rules.

The workflow uses the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets for Wrangler authentication.

## Runtime secrets

Provision the following runtime secrets separately for beta and production in Cloudflare:

- `STEAM_API_KEY`
- `STEAM_ID`
- `TURNSTILE_SECRET_KEY`
- `FORMSPREE_ENDPOINT`

`NASA_API_KEY` is optional; the Worker uses its existing fallback when it is not configured.

## System Status Phase B1: independent history

`GET /api/system-status/history` reads Better Stack's **public Status Page `/index.json`**
server-side. No authenticated Uptime API, Better Stack credential, or browser-side
Better Stack request is used. Phase A `/api/system-status`, `/api/health`, and
`/api/contact/health` remain independent and unchanged. B1 adds no history/incident UI.

### Public configuration and external monitor contract

Supply the non-secret string binding `BETTER_STACK_STATUS_PAGE_JSON_URL` with the
real published status page's HTTPS `/index.json` endpoint. No real URL is supplied
in this change and there is intentionally no default. Missing/invalid configuration
returns the fail-closed payload below without making an upstream or cache request.
The URL must have exactly the `/index.json` pathname, with no username, password,
query string, or fragment. Client query parameters and headers cannot select the
upstream. Custom public status-page domains are supported.

When the real URL is supplied, add it under `[env.beta.vars]` for beta and, only
when production configuration is separately authorized, under `[vars]` for
production in `wrangler.toml`. These environment variables are not inherited
between environments. Both environments read the same **production** monitors.
Do not add `BETTER_STACK_API_TOKEN` to code, secrets, or browser configuration.

Configure Better Stack outside this repository; B1 never creates or modifies its
resources. The public page must contain exactly one `status_page_resource` of
`resource_type: "Monitor"` for each exact, case-sensitive public name:

| Public name | Component ID | Production monitor target |
| --- | --- | --- |
| Website | `website` | `https://huihui.dev/` |
| API | `api` | `https://api.huihui.dev/api/health` |
| Contact Service | `contact` | `https://api.huihui.dev/api/contact/health` |

Website monitoring must check successful HTTP behavior plus a stable HTML marker
(the canonical link to `https://huihui.dev/` is an existing marker), not merely
network reachability. Contact monitoring is GET-only readiness: never submit a
contact form, fabricate Turnstile verification, or generate Formspree mail. Do not
create beta monitors. Monitor settings and their correctness cannot be proved from
the public resource names alone; they require a separate external configuration check.

### Normalized response

HTTP 200 describes endpoint reachability, not successful upstream monitoring.
The response has `ok`, `source: "better_stack"`, `complete`, `windowDays: 90`,
`components`, and `fetchedAt`. Components always appear in `website`, `api`,
`contact` order and contain:

- `id`, `status`, and `availabilityPercent` (number or null).
- `observedDays`: the number of actual returned history records, at most 90.
- `historyStartDate` / `historyEndDate`: earliest/latest returned dates, or null.
- `history`: ascending `{ date, status, downtimeSeconds, maintenanceSeconds }` records.

`windowDays` is a ceiling, not a coverage claim. Four returned days remain four;
gaps are not filled. Empty history is valid and returns zero days and null dates.
`complete` means all three resources are valid with no normalized Unknown state;
it does **not** mean 90 days of observations exist. Returned `not_monitored` days
stay Unknown and must not be interpreted as successful observations by future UI.
Availability is the upstream resource's reported aggregate, not a recalculated
90-day metric or a guarantee that the full window was observed.

| Better Stack state | Public state |
| --- | --- |
| `operational` | `operational` |
| `degraded` | `degraded_performance` |
| `downtime` | `major_outage` |
| `maintenance`, `not_monitored` | `unknown` |
| Unexpected current state | Invalid component / `unknown` |

There is no new System Status `under_maintenance` state. Known maintenance history
retains its separate duration. History requires real `YYYY-MM-DD` calendar dates,
known source states, finite non-negative numeric durations, and unique days.
All records are validated before sorting and retaining the latest 90 returned days.

Availability accepts finite numbers only: `[0, 1]` is a ratio multiplied by 100;
`(1, 100]` is already a percentage. Thus 0 stays 0%, 1 becomes 100%, and 0.99963
becomes 99.963%. Other values invalidate that component and yield null, never a
default green percentage. Internal precision is retained; only public serialization
rounds to eight decimal places to remove floating-point representation noise.

`fetchedAt` is Worker fetch/normalization completion time, retained on cache HIT.
It is **not** the monitor's last-check timestamp. Status-page `updated_at`, internal
IDs, configured upstream URL, and arbitrary upstream content are not returned.

### Bounds, fail-closed behavior, and caching

The adapter reuses `withUpstreamDeadline` and `readResponseJsonWithLimit`: a
4,000 ms deadline covers fetch and body reading, with a 1 MiB maximum body (both
Content-Length and streamed bytes are checked). Requests use GET, JSON Accept,
a fixed Worker User-Agent, omitted credentials, `cache: "no-store"`, and manual
redirect handling. Redirects and all other non-2xx results fail closed.

Configuration, HTTP, network, timeout, oversized body, JSON, or top-level schema
failure returns `ok: false`, `complete: false`, and three Unknown components with
null availability/dates, zero observed days, and empty history. A missing,
duplicated, or malformed required resource invalidates only that component;
valid peers are preserved. Unrelated resources/reports are ignored.

Only complete responses are cached via the Cache API and
`Cache-Control: public, max-age=60`. A configuration-specific internal cache key
ignores client query strings. Incomplete/Unknown responses use `no-store` and are
never cached. `X-Cache` is `MISS` for a new complete result, `HIT` for a still-fresh
cached result, or `BYPASS` for incomplete data. Expired entries are not served as
stale green on upstream failure. Valid outages are cacheable, not just green states.

The route reuses existing production/beta/Preview CORS rules. OPTIONS returns 204;
other methods return 405 with `Allow: GET, OPTIONS`. No credentials or client
headers are forwarded. Diagnostics use fixed route/upstream metadata
(`better_stack_status_page`) and bounded categories/HTTP status only: no body,
URL, IP, visitor User-Agent, token, exception message, or stack trace is logged.

### Live contract verification gate

**BLOCKED until the real public status-page JSON URL is supplied.** Deterministic
unit fixtures validate the adapter, not Better Stack account configuration or
deployed behavior. Keep the B1 PR Draft until a read-only GET verifies HTTP success,
JSON:API page structure, unique Website/API/Contact Service Monitor resources, and
available `status_history`. Do not assume newly created monitors have 90 days.
Do not create/modify monitors, use authenticated APIs, or deploy as part of this check.

References: [Better Stack public JSON API](https://betterstack.com/docs/uptime/status-pages/subscribing-to-status-updates/subscribing-to-api/),
[resource API ratio example](https://betterstack.com/docs/uptime/api/list-existing-resources-of-a-status-page/),
[Cloudflare environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/),
[Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
