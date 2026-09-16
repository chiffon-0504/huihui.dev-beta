# High-resolution failure contract and Firefox retry investigation

The product no longer promises in-page recovery after a failed high-resolution
load. Across Chromium, Firefox and WebKit, failures and timeouts retain the
decoded WebP preview, announce the existing localized error, and leave the load
action `aria-disabled="true"`. The control remains focusable so the failure does
not discard keyboard focus. The handler accepts only the preview state, so
keyboard activation and synthetic clicks cannot start another load in the
failed view. There is no Retry label, automatic retry or reload instruction.

Close, Escape, focus return and image switching remain available. Selecting or
opening an image starts its normal preview state and requires a new explicit
high-resolution action. Successful loads still swap only after decode. R2 URL
identity, immutable cache headers, no-referrer, CSP and CORS are unchanged.

The investigation below is historical evidence for this contract change, not an
ongoing search for workarounds. PR #234 remains Draft for CI and Codex Review.

## Baseline and environment

Fresh `git fetch origin` resolved `origin/main` to
`b54ac87a9f9d6cae22835e22f8e2f2e3459cc027`,
`Merge pull request #233 from chiffon-0504/codex/feat-v2-jpg-on-r2`.
GitHub reported #233 merged at that SHA; `git merge-base --is-ancestor` passed.
The new `fix/v2-firefox-high-resolution-retry` branch started directly from that
fresh main, with a clean worktree and ahead/behind `0/0`.

Observed on Windows, Node 24.15.0, Playwright 1.61.1, bundled Firefox 151.0
(revision 1532), Chromium 149.0.7827.55, and WebKit 26.5 on 2026-09-16.
The unmodified viewer tests failed the 404 and corrupt-JPEG retries; the network
abort retry passed. Both failures retained a decoded WebP preview.

## Historical evidence and attribution

The intercepted fixture uses this exact synthetic JPEG identity for both clicks:

```text
https://assets-beta.huihui.dev/photos/fuji-6dadc0765d40a8aeb5369b5e2111fb552cdcc69e7be4ecf5821b29a5bacb6311.jpg
```

The first response is deliberately 404 or a 200 corrupt JPEG. The handler is
ready to serve a valid 2x3 JPEG on request two. In failing cases:

- The explicit Retry handler creates a second image and assigns exactly the
  same URL. Both assignments have `referrerPolicy: "no-referrer"` and no CORS mode.
- Only one request reaches the interception handler. The retry returns to the
  error state with `data-mode="preview"`, without a CSP violation.
- Plain `Image` probes with no viewer reproduce two `EncodingError` results and
  one request against an actual loopback HTTP server, including `no-store`.
- Removing `src`, keeping the failed image, waiting for `error` instead of
  `decode()`, and reassigning the same element's `src` do not reliably recover.
  The controlled probe uses two separate Playwright button clicks. Exploratory
  DOM-attached loaders also failed; occasional successes are not a repair.
- Launching the same installed Firefox binary directly, with a fresh temporary
  profile and without Playwright launch preferences or Juggler, also reproduces
  both failures under `no-store` and `immutable`. This probe invokes the handler
  from page script; the controlled probe separately covers real input actions.

These observations rule out viewer state and Playwright route interception as
necessary causes. They support failed-image reuse in this Firefox build, with
timing-sensitive recovery. Ubuntu Firefox also reproduced the same corrupt-JPEG
failure in [the investigation CI run](https://github.com/chiffon-0504/huihui.dev-beta/actions/runs/35077997892/job/104734872613)
at `51ca637c448166c02ef7d140ee12a264178af05a` (114 passed / 1 failed): two image
assignments, one identical-URL request, a retained preview and no CSP violation.
This is not a Windows-only compatibility issue. The evidence does not identify
an exact Gecko defect or establish behavior in independently installed stock
Firefox. No stock Firefox was available locally.

HTTP caching is a separate constraint. The native HTTP probe also observes
Chromium reuse of an immutable failed response. Routing disables HTTP caching
([Playwright documentation](https://playwright.dev/docs/api/class-page#page-route)),
so passing intercepted immutable-response tests cannot establish native HTTP
cache recovery. The probe intentionally uses a loopback URL and no application
CSP to isolate image loading; the viewer regression retains the exact R2 URL
and delivered application CSP. Neither probe accesses or modifies R2 objects.

## Current regression checks

Use the existing lockfile dependencies and installed Playwright browsers:

```powershell
npm.cmd ci
npm.cmd run build:v2
npx.cmd playwright test --config=playwright.v2.config.mjs tests/v2/image-viewer.spec.mjs tests/v2/works.spec.ts
npx.cmd vitest run tests/unit/v2-high-resolution.test.mjs tests/unit/v2-locales-types.test.mjs tests/unit/v2-works.test.mjs
```

The viewer tests now require exactly one assignment and request for the failed
image, an unchanged decoded preview, localized error status, a disabled action,
and no further attempt after Enter, Space, synthetic click or the timeout
boundary. They cover 404, network abort, corrupt JPEG, immutable failure
responses and timeout with late completion. They also require successful
explicit loading of another image, normal preview on reopening, keyboard focus
containment and return. Works tests cover the actual zh-Hant/en/ja error copy,
Close and Escape immediately after failure. Normal success, zero requests
before explicit action and CSP negative controls remain covered in every engine.
No browser is skipped or marked as an expected failure.

Local contract validation on 2026-09-16 passed strict TypeScript/build and 41
relevant unit tests. The viewer/Works run was 87 passed / 3 failed: Chromium and
Firefox each passed 30/30; WebKit passed 27/30. All 39 viewer cases and all nine
localized failure/close cases passed. The three failures were WebKit's existing
Works skip-link Tab assertions, before opening the viewer. All three reproduced
at the same assertion in an unmodified Git export of
`51ca637c448166c02ef7d140ee12a264178af05a`; they were not changed or skipped.
Ubuntu CI remains the independent browser validation gate.

## Archived native probe

`tests/scripts/v2-image-retry-probe.mjs` preserves the completed investigation.
It is not run by application code or CI and is not required for the new failure
contract. The standalone script reports observations rather than an acceptance result.
Its exit success only means the diagnostic completed. It compares HTTP versus
route interception, no-store versus immutable failure responses, both failures
and four image lifecycles in Firefox and Chromium. Paths distinguish independent
cases; each case retries its exact original URL with no query or fragment.
`--uncontrolled` starts only the existing Firefox binary with an isolated profile
under ignored `test-results/`, stops that process after reporting, and leaves
the profile there for inspection. It has a 30-second diagnostic timeout, not a
retry or product delay.

## Historical investigation validation

- `npm.cmd ci`: lockfile installation succeeded, audit reported zero vulnerabilities.
- `npm.cmd run build:v2`: strict TypeScript and build passed.
- `npx.cmd vitest run tests/unit/v2-high-resolution.test.mjs`: 33/33 passed.
- Full focused viewer suite: Chromium 12/12, WebKit 12/12, Firefox 9/12.
  Firefox failed corrupt JPEG with no-store and both immutable failure cases.
  The no-store 404 passed in this run but failed on the untouched baseline.
- After persisting the JSON attachment to disk, the final retry-only run was
  13/15: Chromium 5/5, WebKit 5/5, Firefox 3/5. Firefox still failed corrupt JPEG
  with no-store and immutable 404; immutable corrupt JPEG passed on this run.
  Changing failure counts is further evidence against treating one pass as a fix.
- Native diagnostic: 64 cases completed. Firefox issued a second request in
  only 3/32 cases; none of the four lifecycle variants recovered in every case.
  Chromium recovered in all 24 no-store/intercepted cases, and none of its eight
  native immutable cases. These are observations from one matrix, not rates or
  guarantees.
- The direct-launch Firefox diagnostic completed with one HTTP request and two
  `EncodingError` results in each of its four cases.
- Diagnostic syntax and `git diff --check` passed.

The failed retry assertions above belong to the superseded product contract.
Current acceptance is the safe fallback contract described at the top, on all
three browsers. No cache-busting, URL mutation, browser sniffing, fetch/CORS
expansion, proxy, reload workaround, automatic retry or infrastructure change
is introduced. Live R2 acceptance and stock-Firefox comparison were not performed
as part of the historical investigation.
