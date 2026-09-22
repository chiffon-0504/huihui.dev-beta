# Services

This is the V2 JSON transport foundation, independent of V1 clients. No page
imports the public GET client yet and no request runs at module load. Unused services stay outside
the application bundle; there is no demo request or feature migration.

The separate `jev.ts` private POST adapter owns exactly `/api/jev`, sends
same-origin Access cookies, validates a bounded normalized response and uses
the existing `ServiceError` taxonomy. It does not widen the public GET client's
origin/header/credential contract. Local UI tests intercept this exact URL;
localhost never falls back to a public Worker. The production design and
disabled-until-configured boundary are documented in
[Private Jev](../../../workers/huihui-api/JEV.md).

## Consumer contract

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

This resolver does not grant access or select a deployment environment on behalf
of a page. The current V2 CSP is `connect-src 'self'`, so it intentionally blocks
both cross-origin API bases. Existing beta Worker CORS accepts the beta custom
domain and that project's Pages hosts; production accepts the production hosts.
Neither currently admits localhost. The first integration PR must explicitly
decide the trusted page-to-environment binding and obtain the scoped CSP/local
testing policy it needs. This foundation does not change CSP, CORS, Worker routes,
configuration, DNS or workflows, and does not make production network requests.

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
