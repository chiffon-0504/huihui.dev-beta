# Private Jev tool (beta only, disabled until configured)

This document owns the private tool's runtime contract and activation procedure.
It does not authorize provisioning, deployment, production changes, or spending
Jev credit. Follow the repository release gates separately.

## Audit and chosen topology

Fresh baseline: `0549c0c0e858034e6279ff1bf1dd2eab28475866`, fetched
2026-09-22 20:53:53 +08:00, `Merge pull request #243 from
chiffon-0504/feature/v2-mobile-navigation-drawer`. The initial HEAD matched it,
ahead/behind was 0/0, and the isolated worktree was clean. Work is on
`feature/private-jev-tool`.

The repository has a Vanilla TypeScript/Vite MPA, a strict same-origin v2 CSP,
and a separate JavaScript API Worker. The existing public GET client omits
credentials; the public Worker CORS is not an authentication boundary. There is
no existing private session mechanism or rate limiter to reuse.

Read-only Cloudflare inspection on 2026-09-22 confirmed:

- Pages project `huihuidev-beta` builds `npm run build:v2` into `v2/dist`.
- Its only attached domain is `huihuidev-beta.pages.dev`; `beta.huihui.dev`
  remains detached. Both Pages environments lack service bindings.
- The Access API returned `access.api.error.not_enabled`. Access is not enabled.
- No remote configuration, secret, DNS, deployment, stable artifact or tag was changed.

The activation design deliberately uses **one beta origin**:

```text
Browser → Cloudflare Access → beta.huihui.dev/tools/jev/
Browser → Cloudflare Access → beta.huihui.dev/api/jev
                               Pages Function
                               → JEV_API service binding
                               → huihui-api-beta (verifies Access JWT again)
                               → https://api.typesafe.ai/v1/systemone
```

`functions/_middleware.js` gates the static HTML before `next()` and bridges
only the exact `/api/jev` POST. `v2/public/_routes.json` invokes Functions for
`/tools/*` and `/api/jev*`; other existing content remains static. Unknown private
aliases are rejected. Canonical HTML, slashless and `index.html` routes all
require authorization. No public navigation, sitemap, search or homepage entry
is added. The UI supports zh-Hant, English and Japanese at the same private URL.

The Worker accepts only `WORKER_ENV=beta` and `JEV_SITE_ORIGIN=https://beta.huihui.dev`.
Native Pages preview/immutable aliases, localhost and direct workers.dev hosts
cannot use the private capability. The existing public APIs are unchanged.
Local Vite preview intentionally tests the static UI with intercepted API calls;
it is not a production authentication server and must not be publicly exposed.

The browser sends same-origin cookies with a fixed relative POST. Cloudflare
Access owns login/cookies and supplies `Cf-Access-Jwt-Assertion`; application code
never reads the Access cookie, issues a session, stores passwords or keeps users.
The API independently checks the JWT, rather than trusting a Pages marker or an
email header. Verification uses Web Crypto RS256, the configured tenant's public
JWKS endpoint, matching `kid`, issuer, audience, expiry/issued-at/not-before,
human `sub` and the exact allowed email (case-insensitive). Token-controlled key
URLs/algorithms are rejected. JWKS failures deny access; keys are fetched with a
four-second deadline and 64 KiB bound, without a persistent stale-key cache.

## Official Jev contract

Verified against the [TypeSafe HTTP reference](https://docs.typesafe.ai/api),
[Noul](https://docs.typesafe.ai/primitives/noul),
[Score](https://docs.typesafe.ai/primitives/score), and
[Choice](https://docs.typesafe.ai/primitives/choice) on 2026-09-22.
Only documentation was read; no real Jev API call was made.

The Worker fixes `POST https://api.typesafe.ai/v1/systemone`, Bearer authentication,
`model: "jev-latest"` and one question ID, `decision`. It constructs:

```text
state: { context: string[] }
questions.decision: { type: mode, instructions: question, criteria?: ... }
```

Noul omits optional criteria. Score supplies the ordered text criteria array.
Choice maps stable `option_N` IDs to descriptions; user text is never an object
key. `jev-latest` can change upstream versions; response validation fails closed
on incompatible output. No SDK retry or generic proxy operation is supported.

The browser contract is `JevFormRequest` in `v2/src/services/jev.ts`:

```ts
type Common = { question: string; context: string[] };
type JevFormRequest = Common & (
  | { mode: "noul" }
  | { mode: "score"; criteria: string[] }
  | { mode: "choice"; options: Array<{ id: string; label: string }> }
);
```

The Worker trims text, checks exact keys at both object levels and rejects
`model`, `endpoint`, `questions`, `state`, credentials, headers, method and any
other extra controls. Limits are deliberately below Jev's general API capacity:

| Input | Limit |
| --- | --- |
| Request body | 16,384 UTF-8 bytes, streamed and bounded even without Content-Length |
| Question | 1–1,000 JavaScript string code units, nonblank |
| Context | 0–12 nonblank items, 500 code units each |
| Score | 2–10 distinct nonblank levels, 300 code units each |
| Choice | 2–12 distinct labels, 300 code units each |
| Option ID | `option_` plus 1–6 decimal digits, no leading zero; unique |
| Upstream result | 32,768 bytes |
| Browser normalized response | 16,384 bytes |

These bounds allow a small personal decision while bounding body parsing and
upstream token spend. Aggregate byte validation can reject a multibyte form even
when individual field lengths fit. The UI reports a validation error and keeps
the draft. Empty optional context is represented by zero rows; an added row must
contain text or be removed.

`answers.decision` must match the submitted mode. Noul becomes a single
probability, with False computed as its complement. Score retains the **fractional
score**, confidence and distribution; the UI shows its bounding criteria rather
than inventing an integer classification. Choice returns the selected stable ID,
confidence and probabilities. The UI resolves labels from the submitted draft
and marks the highest probability in words as well as color. All values must be
finite and in range; distributions require precisely the submitted IDs, totals
within 0.001 of 1, matching Score legend and mean (0.02 rounding tolerance), and a
Choice winner at a maximum. Invalid results are rejected, never silently repaired.
Upstream metadata, usage, error bodies and model details do not reach the browser.

## Errors, privacy and cost control

- Request-body deadline: 5 seconds. Limiter deadline: 2 seconds. Jev deadline:
  10 seconds across headers/body. Pages bridge: 22 seconds including its bounded
  16 KiB response body; browser: 25 seconds.
- No automatic retries, background requests or calls on page load/mode switch.
  Submit disables duplicate submissions and editing while preserving the draft.
- Local authentication errors use 401/403; local throttling 429; invalid input
  400/413/415; missing config/JWKS/limiter failure 503; upstream HTTP/network or
  invalid response 502; deadline expiry 504. Upstream 401/422/429/529 and other
  non-success statuses are sanitized as upstream failures, not passed through.
  Access itself may redirect expired browser sessions; fetch rejects redirects,
  and the UI offers a page reload to authenticate, without an automatic retry.
- The API requires the fixed Origin, rejects cross-site Fetch Metadata, and
  accepts only JSON POSTs. It emits no permissive CORS headers. Origin checks
  supplement JWT authorization; they do not replace it.
- `JEV_RATE_LIMITER.limit({key: 'jev:' + verifiedSub})` runs before each Jev call.
  Missing, failing or malformed limiters deny calls. Configure 10 requests per
  60 seconds per identity. This is basic abuse protection, **not a global billing
  cap**: Cloudflare's limiter is per location and eventually consistent. The
  single email Allow policy and small requests are the primary cost boundary.
  Account/provider credit limits remain an operator decision. An expired browser
  request can already have consumed upstream credit; do not promise cancellation
  refunds or blindly resubmit.
- Neither server module logs prompts, results, JWTs, email, upstream bodies or
  secrets. No local/session storage, analytics or decision database is added.
  The form disables autofill because private questions should not be retained in
  browser autofill history. The existing theme bootstrap retains only its normal
  theme preference. No API key is ever read by frontend code.
- Private responses use `private, no-store`, noindex/nofollow, no-referrer,
  nosniff and a same-origin CSP. No secret or user data is in the static HTML/JS.
  Source code and build assets are not secret; authentication protects use of the
  page and paid API. Submitted text necessarily goes to TypeSafe; review the
  provider's data handling terms before supplying sensitive personal content.

## Runtime configuration ownership

The caller and callee have separate runtime `env` objects. Importing the same
`jev-security.js` helper shares code, not configuration. A Service Binding
provides a callable Worker; it does **not** expose that Worker's variables,
secrets or other bindings to Pages. No configuration is forwarded in the bridge
request. Configure the four shared `JEV_*` values independently and consistently
on both runtimes.

Verified call sites:

- **Pages HTML:** `functions/_middleware.js` calls `requireJevOrigin()` and then
  `authorizeJev(request, env)` before `next()` for the three supported HTML
  aliases. Pages itself verifies the Access JWT signature/time claims, issuer,
  audience and allowed email using **Pages' own** bindings. Its site-origin
  check compares the request URL origin; it does not require an `Origin` header
  on a normal HTML navigation.
- **Pages API bridge:** the `/api/jev` branch checks the request URL origin and
  uses `env.JEV_API.fetch()`. It forwards the Access assertion and selected
  request headers, but does not call `authorizeJev()` in that branch. The beta
  Worker is the authorization boundary for the paid API.
- **Beta Worker:** `handleJev()` checks `WORKER_ENV`, the URL origin and browser
  `Origin`/Fetch Metadata, then calls `authorizeJev()` with **the Worker's own**
  bindings. Only this runtime calls `env.JEV_RATE_LIMITER.limit()` and reads
  `env.TYPESAFE_JEV_API_KEY` to authenticate the fixed TypeSafe request.

In this table, Pages means the Functions runtime of project `huihuidev-beta`,
in the selected environment serving `beta.huihui.dev`. Its main-branch environment
is named **Production** in Pages; it is not the stable site. Worker beta means
`huihui-api-beta`, selected by Wrangler `--env beta`.

| Runtime | Binding/variable/secret | Required for | Sensitive? |
| --- | --- | --- | --- |
| Pages Functions | `JEV_SITE_ORIGIN` — variable, `https://beta.huihui.dev` | URL-origin gate for private HTML and the API bridge | No; integrity-critical configuration |
| Pages Functions | `JEV_ACCESS_ISSUER` — variable, exact team issuer URL | HTML JWT issuer check and trusted JWKS URL | No; public identifier, integrity-critical |
| Pages Functions | `JEV_ACCESS_AUD` — variable, Access application's audience | HTML JWT audience check | No; public identifier, integrity-critical |
| Pages Functions | `JEV_ALLOWED_EMAIL` — encrypted secret | HTML JWT email allowlist comparison | Yes; private identity, store as a Pages secret |
| Pages Functions | `JEV_API` — service binding targeting `huihui-api-beta` | Caller-side `fetch()` to the API Worker | No credential value; server-only invocation capability |
| `huihui-api-beta` | `WORKER_ENV` — variable, `beta` | Explicit beta-only capability gate; already in `[env.beta.vars]` | No; integrity-critical configuration |
| `huihui-api-beta` | `JEV_SITE_ORIGIN` — variable, `https://beta.huihui.dev` | URL-origin and browser `Origin` checks on the API | No; integrity-critical configuration |
| `huihui-api-beta` | `JEV_ACCESS_ISSUER` — variable, same issuer as Pages | API JWT issuer check and trusted JWKS URL | No; public identifier, integrity-critical |
| `huihui-api-beta` | `JEV_ACCESS_AUD` — variable, same audience as Pages | API JWT audience check | No; public identifier, integrity-critical |
| `huihui-api-beta` | `JEV_ALLOWED_EMAIL` — encrypted Worker secret, same email as Pages | API JWT email allowlist comparison | Yes; provision separately from the Pages secret |
| `huihui-api-beta` | `JEV_RATE_LIMITER` — rate-limit binding under `env.beta` | Verified-subject limit before the TypeSafe request | No credential value; server-only binding |
| `huihui-api-beta` | `TYPESAFE_JEV_API_KEY` — encrypted Worker secret | Bearer authentication to TypeSafe | Yes; this Worker only, never Pages, client, build configuration or production Worker |

`Cf-Access-Jwt-Assertion` is a sensitive **per-request header** supplied by Access,
not a static secret to provision. Both runtimes verify it where described above;
neither runtime needs the Access signing private key or an Access service token.
Access application/policy settings live at the Access edge and do not populate
either runtime's `env` automatically.

Pages does not need `WORKER_ENV`, `JEV_RATE_LIMITER` or `TYPESAFE_JEV_API_KEY`.
The Worker does not need a reciprocal `JEV_API` binding. The existing
`workers/huihui-api/wrangler.toml` configures the Worker only, not Pages Functions.
Worker nonsecret variables and the limiter must be declared explicitly under
`env.beta`; beta secrets must be provisioned against `huihui-api-beta`. Top-level
Worker configuration targets `huihui-api` and is not a source of beta bindings.
Pages Production and Preview settings must likewise be checked independently;
leave Preview unconfigured for this design, and never rely on cross-environment
inheritance. Even an explicitly configured native Pages alias fails the origin
gate. Browser/Vite build-time variables are not a runtime configuration fallback.

This ownership follows the actual code and Cloudflare's
[Pages bindings contract](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
and [non-inheritable environment bindings/secrets](https://developers.cloudflare.com/workers/wrangler/environments/#non-inheritable-keys-and-environments).

### External configuration status (2026-09-23, Asia/Taipei)

The original 2026-09-22 read-only audit found no Jev bindings on either runtime.
The subsequent authorized provisioning run created the following configuration.
This is **partial provisioning, not a live-service acceptance record**.

- The owner personally activated Zero Trust. Access application `Private Jev beta`
  (`f62b4567-2031-411b-82a1-797f6d60c08c`) now contains all four exact/wildcard
  destinations listed below under one audience. Its sole Allow policy includes
  only the owner-provided exact email; no email address is recorded here.
  Login is restricted to email OTP, with a 30-minute session, HttpOnly cookie,
  hidden App Launcher entry and no OPTIONS bypass. The Dashboard did not offer
  the suggested one-hour duration, so 30 minutes was selected. Account inventory
  contained no competing Access application at readback.
- Pages project `huihuidev-beta`, **Production** environment: all four shared
  `JEV_*` settings are saved independently, with `JEV_ALLOWED_EMAIL` encrypted.
  Its caller-side `JEV_API` service binding targets `huihui-api-beta`, service
  environment `production`, entrypoint `default`. That service environment name
  does not refer to the separate production Worker `huihui-api`. Pages Preview
  remains unconfigured. Pages configuration awaits a subsequent deployment.
- Worker `huihui-api-beta`: the four shared auth settings are saved independently,
  `WORKER_ENV=beta` is retained, and `JEV_RATE_LIMITER` uses namespace `922601`
  with `limit=10`, `period=60`. The current account's two Worker scripts had no
  rate-limit namespace collision before creation. Nonsecret vars and limiter
  are also persisted under `env.beta` in `wrangler.toml`.
- Saving Worker settings in Dashboard created configuration-only deployments.
  At the end of that provisioning run, deployment `6c3621ec-fd8c-4bfd-913d-3c698012068a` served version
  `e43ca1e6-919a-408a-87af-62ffd0e7f4c3` at 100%. The old and both new versions
  have identical script ETag
  `642a31623b9b0bdbab3cbb3389d879f49098f7b2b09f63db115ae0588ccffcc7`;
  the private Jev implementation was **not** uploaded.
- The owner subsequently entered `TYPESAFE_JEV_API_KEY` directly in
  `huihui-api-beta`. The 2026-09-23 pre-PR audit confirmed its name and
  `secret_text` type through the secret inventory only. No value was read,
  displayed, copied or requested. It is absent from both Pages environments and
  the production Worker. No real TypeSafe/Jev request was made.
- Pages still reports `fail_open=true` in both environments. The Dashboard
  confirms the account is already on Workers Paid and does not display a
  fail-open/closed control. Cloudflare documents this quota-exhaustion setting
  for Workers Free; the Free daily quota does not apply to the current Paid plan.
  An attempted Pages API configuration write returned error `10000 Authentication
  error` and changed nothing. Do not claim `fail_open=false` was configured or
  quota-failure behavior was exercised. The pre-PR readback still reports
  `fail_open=true` in both Pages environments: this remains an explicit live
  activation blocker even with the Paid plan. No equivalent fail-closed behavior
  is assumed. No billing change was made. This flag belongs to Pages runtime
  configuration; the Access application response has no `fail_open` field.
- `beta.huihui.dev` remains intentionally detached: no Pages custom-domain
  attachment or exact DNS record exists. `BETA_CUSTOM_DOMAIN_ENABLED` remains
  `false`. Restoring this public beta topology remains a separate rollout decision.
- Pages canonical deployment remains `28e07421-0b8d-47c3-9275-a45349c98f83`, SHA
  `0549c0c0e858034e6279ff1bf1dd2eab28475866`. The source implementation remains
  uncommitted on `feature/private-jev-tool` at the end of provisioning. The canonical source deployment
  flow depends on beta main; this run forbids PR merge and did not bypass that
  flow with an untracked source upload.
  The owner explicitly chose to retain this configuration and defer live
  verification until the normal PR flow. No alternative source deployment or
  beta hostname restoration is authorized by that decision.
- Production Worker `huihui-api` still has no Jev bindings. No stable/production
  change, Git commit/push, PR merge, tag or release was performed.

Validation in this provisioning run: the two focused Jev unit files passed all
125 tests using synthetic tokens and mocked upstream calls. TOML parsing and
comparison with HEAD verified that only the three beta auth vars and beta limiter
were added; all remaining Worker configuration matches HEAD. API readbacks
verified resource ownership and saved metadata. Live baseline probes against
native Pages, immutable Pages and the direct Worker observed the old routes
only (Pages HTML 404/API POST 405; Worker HTML catch-all 200/API POST 404).
These are **not** evidence of native-host bypass prevention by the undeployed
Jev handlers. Owner/wrong-email/expired-session Access checks, same-origin API,
live limiter behavior, private response headers and the final minimal real Jev
smoke all remain pending source rollout and required inputs.

### Pre-PR verification (2026-09-23, Asia/Taipei)

Fresh fetch at 00:26:56 +08:00 confirmed `origin/main` and branch HEAD both at
`0549c0c0e858034e6279ff1bf1dd2eab28475866` (ahead/behind 0/0), with the same
merge message recorded in the initial audit. The subsequent read-only metadata
audit reconfirmed the four Access destinations, sole exact-email Allow policy,
OTP-only identity provider, 30-minute session, both runtimes' auth settings,
caller-side service binding and beta limiter (namespace `922601`, 10/60).
Nonsecret site origin/issuer/audience values agree between Pages, Worker and
`wrangler.toml`. Both allowed-email bindings are encrypted; their values were
not retrieved or compared. Their live identity behavior remains an acceptance
gate. Production Worker has no Jev configuration.

Pages Git integration has preview deployments enabled for all branches. To
publish this PR without deploying application code, every pushed commit in this
task uses the official `[CF-Pages-Skip]` prefix. This skips Pages deployment
without changing Cloudflare settings or skipping GitHub Actions checks. See
[Cloudflare's commit-message skip contract](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message).
The Worker and Beta CD deployment workflows trigger only on `main` pushes;
this task pushes the feature branch only and does not merge or dispatch them.

The pre-publication scan checked 376 repository/build text files for literal
Jev credentials, token/private-key patterns and server credential markers in
frontend artifacts. No suspect credential literal or frontend server marker
was found; the single Jev credential literal in tests is the deliberately
nonfunctional `synthetic-jev-secret` fixture. No source maps are emitted. This
was a source/build audit, not a comparison against the real secret value.

Targeted validation on this date passed JavaScript syntax (23 files), strict
TypeScript, Vite build/performance budgets, V2 unit contracts (16 files / 511
tests), existing Worker contracts (12 files / 540 tests), and Jev UI/private CSP
across Chromium, Firefox and WebKit (33 tests, workers 1, retries 0), and local
built-beta/CSP contracts (70 tests with `V2_BETA_LOCAL=1`). The existing
404 WebKit focus issue retains the untouched-baseline evidence below; no
assertion or browser coverage is relaxed for publication.

## External activation checklist (operator action required)

Do not publish this as an enabled/private service until these are complete.
Repository tests cannot certify external configuration. The status above records
completed provisioning and unresolved steps; the checklist remains the acceptance contract.

1. Decide the **one exact email** allowed to use Jev and enable Cloudflare Access.
   Use an existing identity provider or email OTP; no custom password system.
2. After separately approving beta topology changes, attach `beta.huihui.dev` to
   `huihuidev-beta` through Pages Custom domains and verify DNS/TLS. This task does
   not change the currently detached-domain Beta CD setting. Restoring that
   setting and its strict smoke acceptance belongs to the authorized rollout.
3. Create one self-hosted public-hostname Access application, `Private Jev beta`,
   with public destinations on the **same application/audience**:
   `beta.huihui.dev/tools/jev`, `beta.huihui.dev/tools/jev/*`,
   `beta.huihui.dev/api/jev`, and `beta.huihui.dev/api/jev/*`.
   Include an Allow policy for the exact chosen email only. No Everyone,
   email-domain-wide, Bypass, Service Auth or anonymous policies. Access defaults
   to deny; inspect more-specific apps/policies because they can override parent
   paths. Suggested session duration: one hour. Hide it from the App Launcher if
   desired. Two apps are unnecessary with this same-origin topology; a separate
   API audience would require a different browser authentication design.
4. Record the application's audience tag and team issuer URL. Set the following
   runtime bindings on both the beta Worker and the beta Pages environment that
   serves the chosen hostname. Pages calls its `main` environment **Production**;
   this is `huihuidev-beta`, never the stable Pages project:

   | Binding | Value |
   | --- | --- |
   | `JEV_SITE_ORIGIN` | `https://beta.huihui.dev` |
   | `JEV_ACCESS_ISSUER` | Exact `https://<team>.cloudflareaccess.com`, no trailing slash |
   | `JEV_ACCESS_AUD` | Application's 64-character hexadecimal audience |
   | `JEV_ALLOWED_EMAIL` | Exact allowed email; use a secret binding for privacy |

   Keep the preview environment unconfigured. Native Pages aliases are
   rejected by the origin gate even if these bindings are explicitly configured. Configure
   Worker nonsecret vars in `[env.beta.vars]` before the separately authorized
   deployment so later Wrangler deploys do not erase Dashboard-only vars.
   Do not place these values in Vite environment variables.
5. Add Pages service binding **`JEV_API` → `huihui-api-beta`** for the selected
   beta Pages environment. Never bind to `huihui-api`. Public HTTP fallback is
   deliberately absent. New bindings take effect on a subsequent authorized
   deployment. Deploying the bridge against an older Worker still rejects the
   unsupported API and exposes no paid capability.
6. Set Pages **Settings → Runtime → Fail open / closed → Fail closed** before any
   deployment containing private HTML. On the free plan, fail-open would serve
   static HTML when the Functions quota is exhausted. Do not assume middleware
   alone fixes this platform setting. Also verify no Page/Cache Rule overrides
   private no-store responses. No global cache/rules changes are part of this task.
7. Choose an unused account-specific rate-limit namespace ID. Add this to
   `workers/huihui-api/wrangler.toml` **only under beta** before authorized rollout;
   the provisioned namespace below was checked against the current Worker inventory:

   ```toml
   [[env.beta.ratelimits]]
   name = "JEV_RATE_LIMITER"
   namespace_id = "922601"
   simple = { limit = 10, period = 60 }
   ```

   Rate-limit counters share state if namespace IDs collide across Workers.
   The binding is required; there is no in-memory or IP-only fallback.
8. Add **`TYPESAFE_JEV_API_KEY` only to `huihui-api-beta`**, as an encrypted Worker
   secret. It must never be a Pages binding. Dashboard path: Workers & Pages →
   `huihui-api-beta` → Settings → Variables and Secrets → Add → Secret.
   For an already-installed, verified Wrangler CLI, the equivalent interactive
   commands are below. Do not use `npx` to implicitly download Wrangler, omit
   `--env beta`, supply values as arguments, or redirect secrets into logs:

   ```powershell
   Set-Location workers/huihui-api
   wrangler secret put TYPESAFE_JEV_API_KEY --env beta
   wrangler secret put JEV_ALLOWED_EMAIL --env beta
   ```

   Enter each value only at Wrangler's protected interactive prompt. If that
   method cannot be verified, use Dashboard's secret input. Wrangler is absent
   from this task's PATH and dependencies; no CLI installation or secret write
   was attempted through the CLI. The two allowed-email secrets were instead saved
   separately in Dashboard; the TypeSafe secret remains deferred to the owner.
9. Obtain separate release/deployment authorization, then use existing Pages Git
   integration and beta Worker workflow with exact-SHA acceptance. Do not use a
   manual production Worker command, stable promotion, tag or GitHub Release.
   Keep the feature unconfigured if any prerequisite is missing.

## Verification before real use

Local commands use installed dependencies and synthetic data only:

```powershell
npm.cmd run check:js
npm.cmd run check:v2:performance
npm.cmd run test:unit
npx.cmd playwright test --config playwright.v2.config.mjs tests/v2/jev.spec.ts tests/v2/jev-security.spec.mjs
git diff --check
```

Unit tests generate ephemeral RSA keys, sign synthetic Access tokens, exercise
the actual Pages→Worker handler path and mock the exact JWKS/Jev URLs. They cover
request conversion, response validation, forged/expired/wrong-identity tokens,
size/type/control-field rejection, missing config, limiter denials/errors,
timeouts during headers/body, sanitized errors and absence of credentials in
the client output. No fixture contains reusable credentials or real private data.
Browser tests cover both 390×844 and 1440×900, native radio/keyboard behavior,
add/remove/stable option IDs, input preservation, loading/duplicate suppression,
errors, fractional Score, percentages, touch target sizes, overflow and CSP
enforcement with Report-Only/no-CSP negative controls.

After external setup and separately authorized deployment, verify in real Safari
on an iPhone and a desktop browser: anonymous and wrong-email denial on all HTML
aliases and direct API POST; correct-email login; same-origin authenticated API;
expired sessions; direct Worker/native Pages/immutable-preview rejection;
no-store and enforcing CSP; Function quota failure behavior; rate-limit binding
behavior; and no API key in network responses/source maps/bundles. A real Jev
smoke spends credit and needs explicit authorization. Physical iPhone keyboard,
VoiceOver and actual Access cookies/edge routing are not proven by local mocks.

Official configuration references:
[Access application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/),
[JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[application tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/),
[Pages middleware](https://developers.cloudflare.com/pages/functions/middleware/),
[service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings),
[routing and fail-closed](https://developers.cloudflare.com/pages/functions/routing/),
[rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Implementation validation record (2026-09-22)

| Check | Result |
| --- | --- |
| `npm.cmd run check:js` | Passed, 23 JavaScript files |
| `npm.cmd run check:v2:performance` | Typecheck, Vite build and measured budgets passed |
| `npm.cmd run test:unit` after the final bridge fix | 63 files, 1,630 tests passed |
| Focused Jev / build / performance / V2 gate unit tests | 200 passed |
| Jev UI and private CSP tests | 33 passed across Chromium, Firefox and WebKit; workers 1, retries 0 |
| Existing local built-beta / CSP suite | 70 passed; `V2_BETA_LOCAL=1`, no live deployment contacted |
| Existing public loading envelopes | 72 passed across all three browsers |
| Existing 404 suite | 45 passed, 18 WebKit keyboard-focus failures |
| Untouched baseline control | Four representative 404 cases reproduce the same WebKit failure with JavaScript on/off |
| `git diff --check` | Passed |

Initial sandboxed browser runs could not create Firefox pages and did not shut
down reliably with WebKit. The final Jev run completed successfully outside the
sandbox on all three engines without retries or skipped tests. This does not
stand in for physical iPhone Safari/VoiceOver or live Access verification.

The 404 failures occur at the existing `a[href="/"]` Tab-focus assertion in
`tests/v2/not-found.spec.mjs:27`. Building the untouched baseline SHA above in a
local ignored fixture reproduces that assertion failure for `/does-not-exist/`
and `/en/does-not-exist/`, with JavaScript both enabled and disabled. The precise
WebKit/platform cause remains undiagnosed; the issue is present before Jev.
No assertion was weakened, test skipped or unrelated 404 code changed.

All 29 pre-existing built files are byte-for-byte identical to that baseline,
including the 404 HTML, whose SHA-256 is
`6116789396d2d4b632d8cad208a3379d9874dc7cac440b5b27afec7697b42250`.
The private entry adds 22,210 bytes including its routing manifest; total output
is 763,053 bytes. Public pages keep the existing five-request shell envelope.
The aggregate allowance for the added entry is explained in `v2/README.md`;
public per-route, image and largest-file limits were not increased.

Wrangler/Cloudflare-runtime compilation and live service-binding routing were
not run because Wrangler is not installed and deployment is not authorized.
The integration tests execute the actual Pages and Worker handlers under Node
with Web Crypto and controlled fetch/binding fixtures. Actual Access policies,
edge path matching, aliases, quotas and service bindings remain rollout gates.

### Changed-file inventory

Paths below are relative to the repository root. There are 30 changed/new files.

| Area | Files |
| --- | --- |
| Private UI | `v2/tools/jev/index.html`, `v2/src/jev.ts`, `v2/src/styles/pages/jev.css` |
| Localized copy | `v2/src/locales/jev.ts`, `v2/src/locales/zh-Hant.ts`, `v2/src/locales/en.ts`, `v2/src/locales/ja.ts` |
| Private client | `v2/src/services/jev.ts` |
| Pages and Worker | `functions/_middleware.js`, `workers/huihui-api/worker.js`, `workers/huihui-api/jev.js`, `workers/huihui-api/jev-security.js` |
| Beta-only runtime configuration | `workers/huihui-api/wrangler.toml` |
| Build and measurement | `vite.v2.config.mjs`, `v2/public/_routes.json`, `v2/tools/performance.mjs` |
| Static and V2 gate checks | `tests/scripts/check-js.mjs`, `tests/scripts/v2-pr-gate.mjs` |
| Unit tests | `tests/unit/v2-jev-client.test.mjs`, `tests/unit/v2-jev-worker.test.mjs`, `tests/unit/v2-bootstrap.test.mjs`, `tests/unit/v2-performance.test.mjs`, `tests/unit/v2-pr-gate.test.mjs` |
| Browser tests | `tests/v2/jev.spec.ts`, `tests/v2/jev-security.spec.mjs` |
| Documentation | `workers/huihui-api/JEV.md`, `workers/huihui-api/README.md`, `v2/README.md`, `v2/src/locales/README.md`, `v2/src/services/README.md` |

### Decisions still needed from the owner

- Authorization to resolve the Pages `fail_open=true` live blocker.
- Whether to authorize restoring the detached beta custom domain for this
  same-origin design; another hostname requires an explicit contract change.
- Any provider-side overall spending cap beyond the configured identity limiter.
- Separate authorization for source merge/deployment and any real-credit
  Jev smoke test after the prerequisites are complete.

The current publication authorization covers commit, feature-branch push, PR,
CI and Codex Review only. It does not authorize merge, application deployment,
beta hostname restoration, production/stable changes, tags, Releases, secret
writes or real Jev requests.
