# Public JEV Lite (beta only)

The Home window `Yes or NO ?` is independent of the private `/tools/jev/` entry
and `/api/jev` policy. It never sends Access cookies or changes the private
Noul/Score/Choice form. Existing private authorization, limiter and provider
logic remain intact. No real provider request or deployment is needed to test
this feature.

## Request and provider boundary

```text
Home → POST https://beta.huihui.dev/api/jev-public
       Pages middleware → existing JEV_API service binding → huihui-api-beta
       HMAC(edge IP) → JEV_PUBLIC_QUOTA Durable Object → fixed TypeSafe endpoint
```

Only the canonical beta origin is accepted. Native Pages aliases, preview hosts,
direct workers.dev requests, production, cross-site requests and missing
configuration fail closed. Public requests do not enter private JWT validation.
The existing `/api/jev*` Pages route already covers the endpoint; public content
remains static. The relative client URL uses the existing CSP `connect-src 'self'`.

The only accepted body is `{ "question": "One Yes / No question?" }`.
Both Pages and Worker validate exact keys, JSON media type and a streamed
1,024-byte body limit. The untrimmed string must be nonblank, valid Unicode and
at most 99 Unicode code points (an emoji code point counts once). Whitespace is
trimmed only after validation. Arrays, batches, extra fields, context, choices,
mode, model, system prompts and provider configuration are rejected. The Worker
constructs exactly one `decision` question of type `noul`, empty context and
`model: "jev-latest"`. Free text is one question's instructions, never configuration.

`toJevPayload` and `normalizeJevResponse` are reused without changing them.
The upstream target is fixed at `https://api.typesafe.ai/v1/systemone` and the
existing `TYPESAFE_JEV_API_KEY` stays inside the beta Worker/DO runtime. Redirects
are rejected with `manual` on workerd. A ten-second deadline covers headers and
the bounded 32 KiB response. There is no provider retry. Only a valid Noul
probability is accepted; all provider metadata and diagnostics are discarded.

Successful JSON is `{ ok: true, probability, remaining, resetAt }`, where
`probability` is the YES probability and `resetAt` is the earliest successful
use's expiry as Unix milliseconds. The window displays YES or NO with that
answer's probability. All responses are `private, no-store`, with no permissive
CORS. Pages also validates/narrows the bound Worker's response fields.

## Rolling quota and concurrent requests

There was no existing persistent atomic storage binding. Private
`JEV_RATE_LIMITER` is a per-location, eventually consistent short-period limiter;
it cannot provide this rolling success-only contract. The new SQLite-backed
Durable Object is the single coordination point for one HMAC identity, with no
separate D1 database, KV namespace or external service.

The `uses` table contains only random reservation IDs, `pending`/`success` state
and expiry timestamps. Each admission uses a synchronous SQLite transaction:
remove expired rows, count successful plus pending rows, and reserve if below
three. No `await` splits these operations. An alarm is persisted before paid
I/O. Concurrent requests see the reservation while the provider is pending.

Only a validated Noul result converts its reservation to a successful use,
atomically, with expiry at completion plus exactly 24 hours. Finalization checks
the reservation still exists and has not expired; a late result cannot use a
reclaimed slot. Storage output gates precede the response. A fourth successful
use within the rolling window is denied before another provider request.

Invalid input never reserves. Upstream/network/HTTP/JSON/schema failures and
timeouts delete the pending reservation. Storage errors deny success; abandoned
reservations expire after 15 seconds, longer than the ten-second provider
deadline. Persisted successes survive object eviction/restart. Alarm cleanup
deletes expired state even without another visitor, and calls `deleteAll()` once
empty. Requests also prune expiry immediately; resets are not tied to midnight.

Exhaustion returns 429 `rate_limited`, remaining zero and the next expiry.
If capacity is temporarily reserved, 429 `busy` identifies pending work instead
of claiming the daily quota was spent. No response includes an IP identifier.
The quota counts accepted, validated server completions, not browser receipt:
losing a reply after commit does not refund a successful use. A provider may have
processed a timed-out/interrupted request; its billing and execution cannot be
atomically rolled back with local storage. Such a late answer is never returned
as an extra successful result.

## IP privacy

The Pages bridge forwards only JSON/Origin/Fetch Metadata and Cloudflare's
connection identity headers. Cookies, Access assertions, Authorization,
Forwarded, X-Forwarded-For and X-Real-IP are excluded. The Worker uses the trusted
`CF-Connecting-IP`, canonicalizes it, then derives HMAC-SHA-256 with a separate
server-only key before selecting a DO. `CF-Connecting-IPv6` is used only when
the edge IP is a Class E Pseudo IPv4; an unsolicited IPv6 header cannot change a
normal visitor's identity. Missing/malformed identity or key denies the call.

Raw IPs, questions, responses, provider secrets and HMAC keys are never written
to application storage or logged. The DO receives only the question for transient
provider I/O; its name is the digest and its rows contain only quota state. The
browser never receives that digest. Active state is removed by expiry/alarms;
Cloudflare's managed backup retention is separate from active application rows.
The same NAT/public IP shares three uses; changing IP creates another identity.

## Configuration and rollout

This PR provisions nothing and changes no secrets. Follow the normal beta
merge/deployment flow separately; never deploy the top-level production target.

| Runtime | Required setting | Operator action |
| --- | --- | --- |
| `huihui-api-beta` | `JEV_PUBLIC_IP_HMAC_KEY` encrypted secret | Provision a fresh cryptographically random key (at least 32 random bytes, encoded as text) through the secure Dashboard Secret UI. Never put it in chat, CLI arguments, source or Pages/Vite settings. |
| `huihui-api-beta` | Existing `TYPESAFE_JEV_API_KEY` secret | Retain the existing provider credential; do not copy it into Pages or rotate it for this change. |
| `huihui-api-beta` | `JEV_PUBLIC_QUOTA` → `JevPublicQuota` | The PR declares this beta-only binding and `jev-public-v1` SQLite migration. The normal authorized beta deployment creates it; no manual database creation is needed. |
| Pages `huihuidev-beta`, environment serving `beta.huihui.dev` | Existing `JEV_API` service binding → `huihui-api-beta` | Verify it is present on that Pages environment. Keep Preview and the stable site isolated. |

`env.beta.main` selects `worker-beta.js`, the DO export wrapper around the
existing Worker. Production keeps `worker.js` and has no quota namespace or
migration. Missing HMAC/provider/binding configuration produces an unavailable
state rather than relaxing policy. The existing beta deployment verifier also
requires the public DO binding/class and HMAC secret metadata, without reading
secret values; missing or mismatched bindings fail Worker/Beta CD acceptance.
Provision the HMAC secret before the normal beta rollout. Do not routinely rotate
the HMAC key: doing so selects new identities and resets their quotas. A necessary rotation requires
a separately planned pause of at least one full quota window or state migration.

Pages and Worker may roll out in either order. Older Worker/Pages versions return
an unavailable state to the new widget; the old private API remains compatible.
Before enabling live use, verify anonymous `/api/jev-public` reaches the bridge
without an Access redirect while all private `/tools/jev` and `/api/jev` aliases
remain protected. Do not widen or remove the existing private Access policy.
Live configuration and provider acceptance require separate verification; local
fixtures do not prove those external conditions.

## UI and validation

Three typed locales share one window, native input, visible code-point counter,
submit button, polite atomic status region and explicit remaining count. No paid
request runs on load. Before a response (or after uncertain transport failure),
remaining is `— / 3`. Pending submissions are guarded and editing is read-only;
the button stays focusable. Closing/pagehide aborts local pending work. No
question/result/quota goes into localStorage or sessionStorage. All DOM text is
rendered with `textContent`.

Focused checks use existing Vitest and Playwright, with synthetic provider data:

```text
npx vitest run tests/unit/v2-jev-public-worker.test.mjs tests/unit/v2-jev-public-client.test.mjs tests/unit/v2-jev-worker.test.mjs tests/unit/v2-jev-client.test.mjs
npm run check:js
npm run check:v2:performance
npx playwright test --config playwright.v2.config.mjs tests/v2/home.spec.ts tests/v2/jev-public.spec.ts tests/v2/jev.spec.ts tests/v2/jev-security.spec.mjs tests/v2/performance.spec.ts --workers=1 --retries=0
```

The quota unit tests execute the actual SQL with Node's built-in SQLite and test
parallel reservations, mixed failures, rollback, expiry and stale completion
fencing. Required V2 CI retains all three engines and built-beta/CSP controls.

References: [DO storage and output gates](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
[rate-limit consistency](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
[Cloudflare IP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/),
[TypeSafe Noul](https://docs.typesafe.ai/primitives/noul).
