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

## System Status Phase B3.1: public incident updates

`GET /api/system-status/incidents` is a Worker-only adapter for Better Stack's
[public RSS 2.0 status updates](https://betterstack.com/docs/uptime/status-pages/subscribing-to-status-updates/subscribing-to-rss/).
It adds no frontend B3 UI and changes neither current health nor daily history:

| Endpoint | Meaning |
| --- | --- |
| `/api/system-status` | Current Website/API/Contact health (Phase A) |
| `/api/system-status/history` | Daily availability and observed history (B1/B2) |
| `/api/system-status/incidents` | Public incident/maintenance/status-report messages (B3.1) |

### Source and request safety

The adapter reuses the validated `BETTER_STACK_STATUS_PAGE_JSON_URL` configuration,
then derives exactly `/feed.rss` from its origin. With the existing binding this is
`https://huihui-dev.betteruptime.com/feed.rss`. No additional binding or Better Stack
auth token is required. Custom trusted public status-page domains remain supported;
request input cannot choose an origin, path, or upstream headers. B3.1 additionally
rejects whitespace, backslashes, credentials, queries/fragments (including empty
delimiters), normalized dot paths, and non-default ports in the configured URL.

Upstream requests use HTTPS GET, a fixed `huihui.dev system-status-incidents worker`
User-Agent, `Accept: application/rss+xml, application/xml, text/xml`,
`redirect: "manual"`, and `cache: "no-store"`. No inbound Authorization, Cookie,
visitor headers or query parameters are forwarded. Redirects and non-2xx responses
fail closed. The shared deadline mechanism bounds fetching/body reading and async
normalization to 4,000 ms. Synchronous parsing is separately bounded by byte/node/item
limits; a JavaScript timer cannot interrupt synchronous work.

Only RSS/XML content types and valid UTF-8 are accepted. Both declared Content-Length
and streamed bytes have a **512 KiB** ceiling: ample headroom for this text-only,
bounded recent-history adapter without buffering an unlimited provider feed.

### Public JSON contract

```json
{
  "ok": true,
  "source": "better_stack",
  "reports": [
    {
      "key": "64 lowercase hexadecimal characters (SHA-256 of canonical public URL)",
      "title": "API Status 404",
      "url": "https://huihui-dev.betteruptime.com/incident/123",
      "updates": [
        {
          "publishedAt": "2026-08-30T12:00:00.000Z",
          "message": "Investigating the API."
        }
      ]
    }
  ],
  "fetchedAt": "2026-08-31T12:00:00.000Z"
}
```

The values above are illustrative, not an assertion about a real incident.
`fetchedAt` is fetch/normalization completion time and remains unchanged on a HIT.
The endpoint does not infer current severity, recovery, uptime or incident duration
from free-form messages. Consumers must distinguish `ok:false` from validated empty
history; HTTP 200 alone does not prove that the source was available.

### Validation, grouping and bounds

- Require one RSS 2.0 root with one channel, and nonempty scalar channel title,
  description and same-origin root link. A validated channel without items is valid.
  The restricted XML 1.0 reader supports UTF-8 declarations, comments, CDATA and
  the standard Atom self-link namespace. DTDs, external/custom entities, processing
  instructions, namespace rebinding, malformed XML and nested items are rejected.
  Other well-formed metadata is ignored; it is never serialized.
- Each item requires exactly one nonempty scalar `title`, `description`, `link`,
  `pubDate` and `guid`. Nested markup in XML fields is invalid; formatted descriptions
  must be XML-escaped or CDATA, as in RSS. Any malformed item invalidates the **entire
  payload**, even if that item would later fall outside the presentation limits.
- Links must be absolute HTTPS URLs on the configured origin with exactly
  `/incident/{public-token}` (1–128 ASCII letters/digits, `_` or `-`); an optional
  trailing slash is removed. This is the documented public path for status reports,
  including maintenance. No speculative API/monitor/status-report paths are allowed.
  Reject credentials, query/fragment, nonmatching origin, escapes and dot segments
  before URL normalization. Host case and default HTTPS port normalize normally.
- Dates accept the RSS RFC 822/2822 subset: English month, optional matching weekday,
  one/two-digit day, two/four-digit year, hours/minutes with optional seconds, and
  numeric `+/-HHMM`, UT/GMT or standard US timezone abbreviations. Two-digit years
  use the RFC 2822 1950–2049 window; years before 1900, impossible calendar dates,
  invalid times/zones and mismatched weekdays are rejected. Serialize UTC ISO 8601;
  never repair a malformed date with the current time.
- Group by canonical public URL, never title. `key` is its SHA-256 digest, not a
  Better Stack resource ID. GUIDs stay internal, are at most 512 UTF-16 code units
  without whitespace/angle brackets, and deduplicate identical normalized records.
  A GUID reused for conflicting data invalidates the payload. Identical URL/time/text
  updates with different GUIDs are also deduplicated.
- Sort reports by latest update descending (URL breaks equal-time ties). Use the
  latest update's title; title/message lexical order breaks equal-time ties within a
  report. Return updates oldest to newest. Keep at most **20 reports**, each with
  its latest **20 unique updates**, only after validating all source items.
- Accept at most **512 source items**, **8,192 XML elements**, and **16 element
  levels**. Exceeding an input bound is an error, not a silently truncated input.
  Output is a bounded recent view, not a claim of complete historical coverage.

### Plain text, privacy and failures

Titles/messages are normalized server-side, with limits of **200 / 4,000 UTF-16
code units** respectively. Over-limit or empty normalized text fails the payload;
messages are not silently cut off. Decode XML's predefined/numeric entities and
common formatted HTML entities (quotes, nbsp, dashes, ellipsis, copyright, currency,
bullets and numeric Unicode). Unknown HTML named entities remain literal text;
invalid XML entities/code points fail. Each encoding layer is decoded once.

Strip all tags, comments and attributes; discard script/style and embedded
script-capable container contents. Preserve text and block/BR line breaks, collapse
horizontal whitespace and keep at most one blank line. Ambiguous/unclosed markup
fails closed. No angle-bracket opening delimiter or executable markup is emitted.
Future UI must still use `textContent`, never `innerHTML` or another HTML sink.

Only selected already-public titles/messages, canonical incident links and times
are returned. No raw RSS/HTML, GUID, monitor resource/internal URL field, HTTP response
body field, request diagnostics or visitor information is exposed. Link attributes
are discarded, not fetched. Public editorial text itself is not a secret-redaction
service: publishers remain responsible for what they post on their public page.
Diagnostics use only bounded route/upstream/category and optional HTTP status;
raw errors, headers, URLs and provider content are never logged.

Full validation (including an empty channel) returns `ok:true`,
`Cache-Control: public, max-age=60`, and `X-Cache: MISS` then `HIT`. The cache key
includes the validated RSS URL and is separate from current/daily history. There is
no stale fallback or background revalidation. Once the entry expires, any upstream,
configuration, decoding, XML or item failure returns HTTP 200 with
`{ "ok": false, "source": "better_stack", "reports": [], "fetchedAt": "..." }`,
`Cache-Control: no-store`, and `X-Cache: BYPASS`; errors are never cached.
GET/OPTIONS and the existing production/beta/preview CORS rules apply. OPTIONS
returns 204 without fetching; other methods return 405 with `Allow: GET, OPTIONS`.

Tests use synthetic RSS fixtures and stub all upstream/cache access; normal CI
never depends on live Better Stack. Existing Home/status browser mocks and request
assertions are unchanged because no frontend calls the new endpoint in B3.1.

## System Status Phase B1: independent history

`GET /api/system-status/history` reads Better Stack's **public Status Page `/index.json`**
server-side. No authenticated Uptime API, Better Stack credential, or browser-side
Better Stack request is used. Phase A `/api/system-status`, `/api/health`, and
`/api/contact/health` remain independent and unchanged. B1 adds no history/incident UI.

### Public configuration and external monitor contract

The non-secret string binding `BETTER_STACK_STATUS_PAGE_JSON_URL` is configured as
`https://huihui-dev.betteruptime.com/index.json` in `wrangler.toml`. The adapter has
no implicit default. Missing/invalid configuration
returns the fail-closed payload below without making an upstream or cache request.
The URL must have exactly the `/index.json` pathname, with no username, password,
query string, or fragment. Client query parameters and headers cannot select the
upstream. Custom public status-page domains are supported.

The public URL is explicitly set under both `[env.beta.vars]` for beta and
`[vars]` for production. These environment variables are not inherited
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
- `observedDays`: the number of observed history records after excluding source
  `not_monitored` days, at most 90.
- `historyStartDate` / `historyEndDate`: earliest/latest returned dates, or null.
- `history`: ascending `{ date, status, downtimeSeconds, maintenanceSeconds }` records.

`windowDays` is a ceiling, not a coverage claim. Better Stack's fixed 90-day window
can contain `not_monitored` padding before monitoring began or during pauses.
These unobserved days are validated, then omitted entirely: no public Unknown or
replacement record, no contribution to counts or date bounds. Four observed days
remain four; missing and paused dates remain gaps. Empty or entirely unobserved
history is valid and returns zero days and null dates.
`complete` means all three resources are valid with no normalized Unknown state;
it does **not** mean 90 days of observations exist. Historical provider padding
does not make an otherwise healthy component incomplete. Current `not_monitored`
still maps to Unknown and makes the response incomplete, without discarding valid
observed history (including real downtime).
Availability is the upstream resource's reported aggregate, not a recalculated
90-day metric or a guarantee that the full window was observed.

| Better Stack state | Public current state | Public history state |
| --- | --- | --- |
| `operational` | `operational` | `operational` |
| `degraded` | `degraded_performance` | `degraded_performance` |
| `downtime` | `major_outage` | `major_outage` |
| `maintenance` | `unknown` | `unknown` (duration retained) |
| `not_monitored` | `unknown` | Omitted as unobserved after validation |
| `recovered` | Invalid component / `unknown` | `major_outage` if downtime > 0; otherwise `unknown` |
| Unexpected state | Invalid component / `unknown` | Invalid component / `unknown` |

Current resource validation is separate from historical normalization. As checked
on 2026-08-30, Better Stack's public JSON documentation lists only `operational`,
`degraded`, `downtime`, `maintenance`, and `not_monitored`. However, the real
[public payload](https://huihui-dev.betteruptime.com/index.json) emitted historical
`recovered` for API and Contact Service after their setup incidents were resolved,
while their current resource state remained `not_monitored`.
Accept `recovered` only in `status_history`, after normal validation. Positive
`downtime_duration` takes precedence even if maintenance is also recorded. With
maintenance only, or both durations zero, the day remains `unknown`, never green.
Always retain both durations and count the day as observed; resolving an incident
does not erase its downtime. This does not change availability semantics or provide
evidence to accept `recovered` as a current resource state.

There is no new System Status `under_maintenance` state. Known maintenance history
retains its separate duration. History requires real `YYYY-MM-DD` calendar dates,
known source states, finite non-negative numeric durations, and unique days.
All records, including `not_monitored` and `recovered`, are validated before excluding unobserved
days, sorting, and retaining the latest 90 observed records. Malformed or duplicate
unobserved records still invalidate the component; filtering cannot hide them.

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

The real public URL is supplied. A live adapter smoke must use a read-only GET to
verify HTTP success, JSON:API page structure, unique Website/API/Contact Service
Monitor resources, and correct validation/normalization of `status_history`.
Its PASS criterion is correct retrieval and normalization, not all-green status:
current API/Contact `not_monitored` can legitimately yield `ok: false`,
`complete: false`, and `X-Cache: BYPASS` while retaining their real downtime days.
Deterministic fixtures alone do not prove the live contract, account configuration,
or deployed behavior. Keep the B1 PR Draft unless separately authorized otherwise.
Do not assume newly created monitors have 90 days of observations.
Do not create/modify monitors, use authenticated APIs, or deploy as part of this check.

References: [Better Stack public JSON API](https://betterstack.com/docs/uptime/status-pages/subscribing-to-status-updates/subscribing-to-api/),
[resource API ratio example](https://betterstack.com/docs/uptime/api/list-existing-resources-of-a-status-page/),
[Cloudflare environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/),
[Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
