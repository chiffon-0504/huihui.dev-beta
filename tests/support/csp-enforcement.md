# P2-3: browser CSP enforcement infrastructure

This is test infrastructure only, separate from any functional/security CSP fix.

## Delivery and existing coverage

The root `_headers` global `/*` rule supplies an enforcing
`Content-Security-Policy` through Cloudflare Pages. The API Worker is a separate
surface. Existing unit contracts inspect source directives and inline markup;
they do not exercise browser enforcement. The shared E2E static server sends
content headers only, so ordinary local E2E does not reproduce Pages CSP.

Regressions can occur if the header is removed, renamed to Report-Only, weakened,
or stops reaching deployed HTML. The new tests catch the first three for the
repository policy's inline-script contract. They do not verify Cloudflare's
deployed response headers, edge injection, every route, or every CSP directive.

## Behavioral evidence

`csp-enforcement.mjs` serves intercepted HTTP responses at a controlled origin;
no DNS or external service is needed. An allowed same-origin script installs the
violation listener, then a parser-inserted inline script attempts a DOM mutation.
A final allowed external script marks completion and wires a working button.
Assertions check the completed parse, button interaction, DOM mutation, and
structured `securitypolicyviolation` evidence, not console wording or silence.
Playwright evaluation only reads observations; it never executes the probe.

The same probe must remain unexecuted with enforcing CSP, and must execute with
Report-Only or no CSP. Report-Only must emit disposition `report`, whereas
enforcement must emit `enforce`. These negative controls prove that a broken
probe or a reporting policy cannot masquerade as a blocking policy.

The repository-policy test reads the actual global header name and value without
promoting Report-Only to enforcement or supplying a fallback. Its adapter fails
on missing CSP, duplicate CSP headers, or path-specific CSP rules; extend it
explicitly if the Pages configuration changes. A separate real-homepage test
applies those headers to the local document and opens/closes the mobile drawer
using production scripts. External requests are aborted in that test to keep
this specific interaction independent of APIs and third-party services.

The current repository policy passes this bounded contract, including the real
drawer interaction. No functional defect was reproduced and no assertion is
disabled or expected to fail. This does not certify complete site compatibility
or live delivery. Any later discovered production incompatibility must be fixed
in a separate functional PR, not by weakening these assertions. A future live
delivery test should consume the deployed response as-is and verify its CSP and
behavior; it must not inject a replacement policy like the local adapter does.

## Execution boundaries

- PR: five tests in the existing Chromium critical job, with zero retries; no
  additional browser installation or full-suite matrix.
- Main: automatically included in the existing sharded Chromium full suite.
- Nightly: automatically included in the Chromium full suite. The existing
  Firefox/WebKit critical subset is unchanged; manual full-compatible runs may
  also exercise these browser-independent tests.
- Beta CD/live smoke: unchanged; this PR does not claim deployment verification.

Run the focused deterministic sample (50 cases, ten repeats per test):

```sh
npx playwright test tests/e2e/csp-enforcement.spec.mjs --project=chromium --workers=1 --retries=0 --repeat-each=10
```

The normal `npm run test:e2e` also discovers this file. There are no sleeps,
skips, dependencies, production header changes, or application changes.
