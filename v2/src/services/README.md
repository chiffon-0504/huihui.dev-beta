# Services

This is the V2 JSON transport foundation, independent of V1 clients. Home's
System Status is its first public GET consumer. No request runs at module load.

The separate `jev.ts` private POST adapter owns exactly `/api/jev`, sends
same-origin Access cookies, validates a bounded normalized response and uses
the existing `ServiceError` taxonomy. It does not widen the public GET client's
origin/header/credential contract. Local UI tests intercept this exact URL;
localhost never falls back to a public Worker. The production design and
disabled-until-configured boundary are documented in
[Private Jev](../../../workers/huihui-api/JEV.md).

## Consumer contract

`jev-public.ts` is the independent Home-only POST adapter for `/api/jev-public`.
It sends only one question with omitted credentials, validates the small public
probability/quota response, and supports cancellation and a 25-second deadline.
It does not widen the shared GET transport or reuse private Access cookies.
See [Public JEV Lite](../../../workers/huihui-api/JEV-PUBLIC.md) for its server policy.

`requestJson(environment, path, validate, options?)` performs one JSON GET and
returns `Promise<T>`, inferred from a required `(value: unknown) => value is T`
guard. Feature adapters should own their path and small synchronous data guard.
They must validate the fields they consume; a TypeScript generic alone does not
validate a response. No schema library or domain-specific DTO is introduced.

The transport parses JSON, then runs the guard exactly once. A false result or
throw becomes `invalid_data`; a successful guard returns the parsed value.
An API payload such as `{ ok: false }` is not automatically a transport failure:
the feature adapter owns the Worker endpoint's domain semantics and UI fallback.
UI code should map `ServiceError.kind` to localized copy and render external data
with safe DOM APIs, never display raw server diagnostics as markup.

Requests use `Accept: application/json`, CORS mode, omitted credentials,
`redirect: "error"`, `referrerPolicy: "no-referrer"` and `cache: "no-store"`.
There is no arbitrary `RequestInit`, auth/header override, automatic retry,
fallback origin, caching layer or direct third-party integration. HTTP redirects
are rejected by fetch before following them, so a Worker response cannot redirect
this client to GitHub, NASA, Steam or an RSS provider. Those services and their
secrets remain behind the Worker boundary.

## Explicit origin policy

`endpoints.ts` accepts only an explicit `"beta"` or `"production"`, mapping to
the public bases documented in [the Worker README](../../../workers/huihui-api/README.md):

| Environment | API origin |
| --- | --- |
| beta | `https://huihui-api-beta.huihuigames01.workers.dev` |
| production | `https://api.huihui.dev` |

Missing/unknown environments fail rather than silently choosing production.
There is no `window.location` inference, Vite mode inference, local proxy,
environment variable, arbitrary base URL or import of V1 origin helpers.
Only canonical `/api/` paths with nonempty lowercase ASCII letter/digit/hyphen
segments are accepted. Absolute/scheme-relative URLs, dot segments, encoded
paths, backslashes, whitespace, trailing slashes, queries and fragments fail
before fetch. Query parameters and write requests are deferred until a real
endpoint contract needs them; callers must not work around this with raw fetch.

The resolver does not select an environment on behalf of a page. `main.ts`
explicitly binds the current beta/development application to `"beta"` and passes
that choice through Home to the status service. A future production entry must
explicitly select `"production"` and ship its corresponding CSP; Vite's
production build mode and a temporary preview hostname never select production.
V2's `connect-src` preserves `'self'` and allows only the exact beta API origin.
Existing beta Worker CORS accepts the beta custom domain and this project's
Pages hosts; production accepts production hosts. Neither admits localhost.
Local browser tests intercept only the exact endpoint with synthetic responses;
ordinary localhost requests fail closed rather than bypassing CORS or falling
back to production. Worker, CORS, DNS and remote settings remain unchanged.

## System Status

`system-status.ts` owns `GET /api/system-status`, a six-second deadline and
validation of `ok`, the five supported states, a canonical `checkedAt` timestamp,
unique known component IDs, required Website/API and optional Contact. Components
are resolved by ID. The UI uses the API overall status, including Contact's
contribution, without adding a Contact row or recomputing overall from two rows.
Unknown states are valid health data; malformed data or request failures make
the entire surface unknown. No retry, polling, history or third-party call runs.

Each surface has an independent generation/controller. Refresh supersedes the
previous request; close/pagehide cancels it; persisted pageshow refreshes an open
surface. Loading, overall and row labels use the existing three typed locales.
The API describes canonical environment health: beta Website probes
`beta.huihui.dev`, not the Pages preview hosting the UI. A beta Website partial
outage while that custom domain is disabled must remain a partial outage.

## Failures and cancellation

All request failures reject with `ServiceError`; no failure becomes empty data.
Errors contain only a fixed developer message, `kind`, and optional HTTP `status`.
They contain no response body, URL, headers, native cause or caller abort reason.

| Kind | Meaning |
| --- | --- |
| `configuration` | Invalid environment, endpoint, validator or timeout |
| `network` | Fetch/body transport failure, including browser CORS/CSP/redirect rejection (not individually observable through fetch) |
| `timeout` | The client's request deadline expired |
| `aborted` | The caller's signal was already aborted or cancelled this request |
| `http` | A non-2xx response; `status` is preserved, its body is not read |
| `invalid_json` | Successful HTTP response with malformed or empty JSON, including 204 |
| `invalid_data` | Parsed JSON fails the feature guard or the guard throws |

Each call owns an `AbortController`. `options.signal` can cancel the call without
affecting concurrent calls. `options.timeoutMs` defaults to 10,000 ms and must be
a positive integer no larger than 2,147,483,647. One deadline covers both fetch
and response-body reading. Cancellation races the pending operation and aborts
the transport; the first cancellation reason wins. Listeners and timers are
removed on success and every failure, and late transport results cannot validate
or return stale data. Timers cannot interrupt synchronous JSON parsing or guards;
endpoint-specific payload limits belong to a future integration when needed.

`tests/unit/v2-services.test.mjs` uses mocked fetch, controlled responses and fake
timers, plus positive/negative TypeScript consumer fixtures. No external requests
are made. Existing V2 unit/build budgets continue to cover application artifacts.
