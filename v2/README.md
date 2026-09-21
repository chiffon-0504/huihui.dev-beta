# v2 application shell

A Vanilla TypeScript application for v2 development in `huihui.dev-beta`.
The existing beta Pages project hosts this application. The separate stable
repository and `huihui.dev` remain on v1.6.4. Nothing from the v1 CSS, scripts,
widgets, or vendor bundle is imported by this application.

## Local development

Use Node.js 24 and install dependencies from the repository root with `npm ci`.

- `npm run dev:v2` starts the v2 development server.
- `npm run check:v2:types` checks the strict TypeScript application;
  `npm run check:ts` remains a compatibility alias.
- `npm run build:v2` typechecks and builds twelve content entries plus one shared
  `404.html` error document into `v2/dist/` (thirteen HTML files total).
- `npm run preview:v2` serves that build locally.
- `npm run test:e2e:v2` builds and tests Chromium, Firefox, and WebKit.
- `npx vitest run tests/unit/v2-` runs the focused v2 unit contracts, including
  locale, contrast, theme lifecycle and solar calculation coverage.
- `npm run test:unit` also includes these contracts.

Browser specs that import application TypeScript use `.spec.ts`, allowing
Playwright's [TypeScript transform](https://playwright.dev/docs/test-typescript)
to load both the spec and its source
dependencies in the same module mode. Playwright transforms specs without type
checking; `check:v2:types` checks the application. The theme spec loads the
shared `.mjs` CSP helper with native asynchronous `import()` so it remains ESM
instead of passing through a CommonJS `require`. Pure solar and timezone tests
remain in the focused Vitest suite. The theme browser spec uses the production calculator
only to exercise real sunrise/sunset transitions.

The v2 server serves Home at `/`, `/en/`, and `/ja/`, and About at `/about/`,
`/en/about/`, and `/ja/about/`. Works uses `/works/`, `/en/works/`, and
`/ja/works/`. Posts uses `/posts/`, `/en/posts/`, and `/ja/posts/`. The generated `v2/dist/` is a
standalone site root; opening the source HTML directly or using the v1 static
server does not compile TypeScript. Vite copies `public/_headers` into the build.
This beta CSP, noindex policy and revalidation headers apply to v2 beta.
Existing shell tests also retain coverage under the root v1 `_headers` policy.

### Strict unknown-path HTTP contract

The navigable content inventory remains exactly twelve Home/About/Works/Posts
entries. `404.html` is one shared error document, not a content page, `Page`
identity, navbar entry, language-switch destination or sitemap route.
The emitted HTML inventory is exactly those twelve entries plus `404.html`: 13.

Unknown URLs, including unknown languages and extra path segments, return HTTP
404 with the intentional error document and preserve the requested URL. They
never serve or redirect to Home, infer a locale, or echo the path/query. The
static document owns all three explanations and native escape links to `/`,
`/en/`, and `/ja/`, with language attributes, headings and visible focus. It
imports shared CSS tokens/defaults but loads no script, theme bootstrap or
application resolver; it remains usable without JavaScript.

Vite stays in MPA mode. Its preview plugin normalizes only aliases of known
content entries (`/en/posts` and `/en/posts/index.html` to `/en/posts/`, preserving
queries). It reserves `/404.html` and `/404` before static middleware, then lets
real files and content resolve before the 404 fallback.
`/en/posts/extra/` can never normalize to Posts. The fallback serves the built
error bytes with status 404, including HEAD semantics and configured preview
security headers. Error responses require `Cache-Control: no-store`, matching
the Pages override observed on the exact-SHA immutable PR deployment on
2026-09-17. Content responses keep the existing `_headers` revalidation policy;
the dedicated 404 verifier requires no-store rather than accepting arbitrary
cache headers. The development server remains Vite's source-development server;
HTTP parity checks run against `npm run build:v2` and `npm run preview:v2`.
[Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)
uses the top-level static `404.html` to disable its default SPA fallback.
Local preview and Pages are expected to match status, error content and original
URL. Two exact rules in `public/_redirects` internally rewrite `/404.html` and
`/404` to the deliberately absent `/__v2-not-found__/` target. Pages then serves
the shared error document with HTTP 404 instead of normalizing the error file
into a successful content URL. The rewrite's `200` is Pages' proxy syntax, not
the final missing-asset response status. No Worker, Function or Dashboard change
is needed; build contracts keep the rewrite target absent.

`tests/v2/not-found.spec.mjs` covers unknown paths with/without JavaScript,
keyboard escape links, all twelve HTTP 200 entries, canonical aliases, real and
missing assets, and narrow-screen reflow in Chromium, Firefox and WebKit.
`tests/v2-beta/not-found.spec.mjs` uses a dedicated expected-404 verifier; the
generic success verifier still requires HTTP 200. It checks exact built error
HTML/CSS, no Home shell, original URL, delivered CSP/noindex/security headers and
unexpected resources. The existing Beta CD exact-SHA immutable Pages gates run
this contract after future deployment; local fixture results do not prove edge
delivery. CSP enforcing, Report-Only and no-CSP controls remain in the Beta suite.

## Performance budgets

`npm run check:v2:performance` typechecks and performs a clean production build,
then inventories `dist/` recursively. It prints uncompressed UTF-8/binary byte
totals, every HTML entry, every individual JS/CSS bundle, and the full file
inventory before enforcing `tools/performance.mjs`. Missing build categories,
an incomplete HTML inventory or an exceeded budget exit nonzero. Each exceeded
budget reports its name, actual bytes and allowed bytes. Unknown file types
(for example a future font) still count toward the total; copied public files
are included. No runtime dependency, Lighthouse score, timing threshold or
external network measurement is required.

Baseline: `2d46ec0f73857859cb73bf92def428eec06b7060` on 2026-09-20,
Node 24.15.0 / locked Vite 8.1.4, Windows. Two clean builds had identical
filenames and SHA-256 digests. A separate Git-exported LF build had the same
byte totals and bundle names. Hashes are reported as filenames, never budget
keys: changing a hash alone cannot fail a byte budget. These observations do
not promise identical output from a future toolchain.

All values below are decimal, **uncompressed artifact bytes**, not gzip/Brotli
wire transfer or a sum of all pages a visitor downloads.

| Measurement | Baseline | Limit | Headroom |
| --- | ---: | ---: | ---: |
| All HTML (12 content entries + shared 404) | 10,589 | 11,200 | 5.77% |
| All JS (including classic theme bootstrap) | 90,961 | 96,000 | 5.54% |
| All CSS (including 404 CSS) | 16,688 | 17,600 | 5.47% |
| All local images (9 WebPs + SVG sprite) | 619,357 | 650,000 | 4.95% |
| Entire output (including `_headers` / `_redirects`) | 738,093 | 775,000 | 5.00% |
| Largest JS bundle | 69,073 | 73,000 | 5.69% |
| Largest CSS bundle | 13,070 | 13,800 | 5.59% |
| Largest local image | 122,618 | 129,000 | 5.20% |

The nine WebPs total 617,206 B. Individual bundles are `main-*.js` 69,073 B,
`theme-bootstrap-*.js` 21,888 B, `main-*.css` 13,070 B and
`notFound-*.css` 3,618 B. The SVG sprite is 2,151 B. The roughly 5% rounded
headroom permits small copy/compiler changes while catching an extra large
module, stylesheet or photo variant. Aggregate budgets also catch many small
additions; largest-file limits prevent concentrating a regression in one file.
No variation was observed in repeated builds, so this is intentional growth
allowance, not a measured noise tolerance.

### Browser request envelope

`tests/v2/performance.spec.ts` checks all twelve localized entries in Chromium,
Firefox and WebKit at 1440×900 and 390×900, using the existing desktop presets
(device scale factor 1 for Chromium/Firefox, 2 for WebKit), fresh contexts
with cache disabled by interception. Requests are counted with multiplicity
and charged their matching build-file bytes. The initial checkpoint is the
document load plus decoded eager image (Works) and completed SVG sprite. Lazy
image counts at that checkpoint are observations, not fixed expectations.
The second checkpoint scrolls/decodes every gallery image, or exercises the
footer/language control on routes without photos. No fixed sleep or assumed
lazy-loading distance is used. Each test attaches the requested paths, byte
footprint and limits as JSON (`resource-footprint`).

| Shared browser budget | Baseline envelope | Limit |
| --- | ---: | ---: |
| Shell requests including document | 5 | 5 |
| Shell requested build bytes, all locales/routes | 106,910–107,037 | 113,000 |
| Works local photo requests before viewer actions | 3 after scrolling | 3 |
| Works local photo bytes, largest candidate for each photo | 344,696 | 365,000 |
| Home/About/Posts gallery or external requests | 0 | 0 |

The shell is one document, classic bootstrap, app module, stylesheet and SVG
sprite. Its byte limit adds 5.57% to the largest localized shell. Works' photo
byte limit adds 5.89% to the three 1200px variants; it covers native responsive
selection without pinning a browser's lazy distance or chosen candidate. There
is no spare request: an architectural change to the request graph needs review.
These are two reusable byte/request envelopes, not twelve duplicated thresholds.
Actual requested bytes depend on the candidates and which lazy images have
started; they are not encoded response sizes, HTTP overhead, or live CDN transfer.

Measured English-route examples (same build; counts include the document):

| Route / browser | Initial requests / bytes | After ordinary browsing |
| --- | --- | --- |
| Home, all browsers / both widths | 5 / 106,975 | unchanged |
| About, all browsers / both widths | 5 / 106,965 | unchanged |
| Posts, all browsers / both widths | 5 / 106,914 | unchanged |
| Works, Chromium 1440px | 8 / 295,252 | unchanged |
| Works, Chromium 390px | 8 / 191,098 | unchanged |
| Works, Firefox 1440px | 6 / 159,506 | 8 / 295,252 |
| Works, WebKit 1440px (2x) | 7 / 328,998 | 8 / 451,616 |
| Works, WebKit 390px (2x) | 7 / 225,824 | 8 / 295,252 |

These initial lazy counts record this observation only; assertions use the
envelope above. Every locale is measured by the same spec and attached report.

Gallery images retain one eager cover, two `loading="lazy"` images, async
decoding and no high fetch priority or image preload/prefetch hints. Unrelated
routes cannot request the gallery even though its URLs exist in the shared JS.
Normal loading rejects external and non-build requests before dispatch and
fails on runtime/resource errors. The separate existing viewer contracts prove
that scrolling, hover, focus and preview opening succeed with R2 unavailable,
using local WebP only. Explicit high-resolution actions may request only the
selected published JPEG with no referrer; localized fallback and synthetic
success/error/stale-completion/CSP controls remain covered. R2 requests are
intercepted in tests; no source JPEG is downloaded.

The optional published JPGs are 1,587,326 B (Fuji), 1,963,940 B (Tsutenkaku) and
3,257,044 B (Shiba). They are user-requested media and excluded from initial
page/build budgets. Their publication, integrity and privacy contracts remain
owned by the media documentation and existing tests.

### Validation and intentional growth

The existing in-memory production build in `tests/unit/v2-bootstrap.test.mjs`
applies the same budget logic to emitted output plus copied public files. Thus
the existing PR/main static-unit and V2 unit jobs enforce the budgets without
another build or workflow change. The existing V2 browser matrix discovers the
loading spec. Worker deployment gains no browser dependency; PR/main/Beta CD
responsibilities, retries and security controls are unchanged.

Run `npm run check:v2:performance`, `npx vitest run tests/unit/v2-`, and
`npx playwright test --config playwright.v2.config.mjs tests/v2/performance.spec.ts tests/v2/works.spec.ts tests/v2/image-viewer.spec.mjs`
(the performance command builds before the browser tests). A plain unit run
does not write or refresh `dist/`.

When architecture intentionally grows, measure the fresh production output and
all affected localized request paths first. Explain the new bytes/requests in
the PR, update the shared limits and this baseline together, and retain negative
unit checks and resource-isolation/privacy contracts. Do not auto-refresh limits
from the build under test or raise them merely to clear a failure.

The shared application currently includes all page modules and locale copy,
and both bootstrap and app include theme calculation data. This is observable
build structure, not proof of a performance regression; no speculative code
splitting or application optimization is part of this baseline PR. No DevTools
performance trace was captured, LCP/INP/CLS were not trace-measured, and no
trace-derived savings are claimed. A request snapshot does not prove permanent non-use.

## Beta deployment

Use the existing Cloudflare Pages Git integration:

| Setting | Required value |
| --- | --- |
| Repository | `chiffon-0504/huihui.dev-beta` |
| Pages project | `huihuidev-beta` |
| Production branch | `main` (beta project terminology only) |
| Root directory | repository root (empty) |
| Build command | `npm run build:v2` |
| Build output directory | `v2/dist` |
| Node.js | `24` |
| Custom domain | `beta.huihui.dev` — intentionally detached during reconstruction |
| Pages domain | `huihuidev-beta.pages.dev` — active preview surface |

Cloudflare installs the repository dependencies and builds the twelve Home/About/Works/Posts
routes above plus the shared error document. Git integration is the only Pages publication path;
there is no separate Direct Upload project or manual GitHub Pages deploy job.
The Dashboard build settings must be updated by an authorized account operator;
repository changes alone do not switch the hosted build from the root v1 site.

[Beta CD](../.github/workflows/beta-cd.yml) retains the existing exact commit,
canonical Pages deployment and required beta Worker gates. Its version-controlled
workflow environment sets `BETA_CUSTOM_DOMAIN_ENABLED: 'false'` while
`beta.huihui.dev` is intentionally detached during V2 reconstruction. Only the
custom-domain API lookup and custom-domain smoke are skipped; native Pages
exact-SHA synchronization, quiescence, live smoke, Worker state/API smoke and
post-smoke identity verification remain required. The active preview endpoint
is `https://huihuidev-beta.pages.dev`; smoke uses the API-verified immutable URL
for the exact workflow SHA rather than the mutable alias.

Set that single value to `'true'` to require the active custom domain and its
smoke again. Missing domains (including HTTP 404), inactive domains and API errors
then fail as before. Missing or invalid mode values also fail; a domain 404 never
selects disabled mode. No repository setting or Cloudflare mutation is involved.
Acceptance of a mode change is the first `main` push using the new workflow;
rerunning an older workflow run does not validate the change.

Beta CD builds the expected v2 assets, runs the applicable Chromium security
contracts, then rechecks the active Pages identity:

- **Native Pages strict contract:** the quiescence gate supplies the immutable
  URL of the successful canonical deployment for the exact workflow SHA. The
  browser compares navigation HTML with the checkout build and reads every
  emitted JS/CSS/SVG/WebP asset through same-origin fetch under delivered CSP to
  compare SHA-256 digests with build bytes. It rejects non-build requests before
  dispatch,
  verifies delivered security headers, and rejects every CSP violation and
  console error. Enforce, Report-Only and no-CSP isolated probes run here.
- **Custom-domain contract (when enabled):** `https://beta.huihui.dev` runs the same three-locale
  Home/About/Works/Posts desktop/mobile, theme, language, build-byte and security-header checks. The
  only platform exception is the Cloudflare Free-plan JSD bootstrap observed on
  2026-09-13. Its entire executable text is pinned, including the iframe bootstrap
  and `/cdn-cgi/challenge-platform/scripts/jsd/main.js`; only a hexadecimal Ray ID
  and base64 decimal timestamp vary. Removing exactly that script must restore
  the repository HTML byte for byte. Exactly one enforcing inline CSP event must
  match its document, directive, policy and line, with exactly one console error
  matching the script's SHA-256 and source location. Missing evidence, changed
  injection, extra scripts/resources or unrelated errors fail closed. The
  exception is unavailable on every other origin, including native Pages.

Strict CSP blocks the injected bootstrap; the smoke never permits JSD execution
or challenge requests. Challenges, redirects and missing headers remain hard
failures. Neither contract submits Contact, replaces live CSP headers, solves
challenges or retries failures. A future Cloudflare bootstrap or Chromium
diagnostic change requires fresh evidence and a reviewed contract update.
The same observation also found `/cdn-cgi/speculation` on the custom domain.
That additional edge resource is outside the JSD exception and remains a hard
failure; passing local fixtures or native Pages does not clear this live blocker.
The existing independent beta Worker API health checks remain in Beta CD.

Run the same browser contracts locally after `npm run build:v2`:

```powershell
$env:V2_BETA_LOCAL = "1"
npx playwright test --config=playwright.v2-beta.config.mjs
Remove-Item Env:V2_BETA_LOCAL
```

Local mode serves the built headers on `127.0.0.1:4176`; it does not prove live
DNS, TLS or deployment identity. PR validation runs this coverage, including
enforcing, Report-Only and no-CSP controls and rejected navigation fixtures.
No deployment manifest, upload token or separate Pages resolver is required.
Live runs select `V2_BETA_CONTRACT=pages` with the API-verified
`V2_BETA_PAGES_URL`, or `V2_BETA_CONTRACT=custom` for the fixed beta origin.
Build inputs must have the same bytes as the Git/Linux Pages checkout; Windows
CRLF conversion can change emitted asset hashes and correctly fails live byte
comparison. Local fixture tests do not prove the current edge injection or
deployment identity. Beta CD runs on `main` pushes, so pre-merge live validation
of test-only changes uses the verified current deployment and its unchanged
application build; it is not a Beta CD execution for the PR SHA.

The v2 application, these build settings and this workflow are beta-only. They
do not change the stable repository, production Pages/Worker, tags or releases.

## Structure

The TypeScript foundation lives in `src/`, with compiler settings owned by
`v2/tsconfig.json`. The root `tsconfig.json` extends that configuration for
existing editor and compiler entry points. Strict checking targets ES2022 with
DOM typings and ES modules; `moduleDetection: "force"` gives source files module
scope even before they have imports or exports. Shared state should be owned by
modules or passed explicitly, rather than attached to browser globals.
TypeScript checks without emitting files. The existing Vite configuration at
`../vite.v2.config.mjs` handles browser bundles, CSS/SVG/WebP imports, the classic theme
bootstrap and the twelve HTML entries. No additional compiler, bundler or
framework dependency is needed.

```text
v2/
├─ src/
│  ├─ main.ts          # Existing application bootstrap
│  ├─ components/     # Existing shared UI components
│  ├─ services/       # Typed JSON transport and explicit Worker origin boundary
│  ├─ utils/          # Reserved for future reusable utilities
│  ├─ locales/        # Canonical typed ZH-Hant / EN / JA copy
│  ├─ types/          # Reserved for future shared application types
│  ├─ media/          # Image definitions and bounded local variants
│  ├─ posts/          # Canonical post and category identities, dates and destinations
│  ├─ pages/          # Existing page modules
│  ├─ theme/          # Existing theme implementation
│  ├─ styles/         # Canonical v2 CSS foundation
│  └─ dom.ts          # Current DOM helpers
├─ en/index.html
├─ en/about/index.html
├─ ja/index.html
├─ ja/about/index.html
├─ index.html
├─ works/index.html
├─ en/works/index.html
├─ ja/works/index.html
├─ posts/index.html
├─ en/posts/index.html
├─ ja/posts/index.html
├─ about/index.html
├─ public/
├─ tsconfig.json
└─ README.md
```

The [service foundation](src/services/README.md) provides validated JSON GETs,
normalized errors, cancellation and explicit beta/production Worker origins.
No page consumes it yet; feature integration and the required CSP/origin policy
remain separate work.

V1 remains the active production site while v2 development continues; its root
HTML/CSS/JavaScript and release flow remain independent of these TypeScript
commands. The page roadmap is **Home ✅ / About ✅ / Works ✅ / Posts ✅**. Contact belongs exclusively to
the shared footer, with no standalone Contact route, module or stylesheet.

`src/main.ts` composes DOM components from `components/navbar.ts`,
`components/footer.ts`, and `pages/home.ts`, `pages/about.ts`, `pages/works.ts`, or `pages/posts.ts`. Shared localized copy lives in
`locales/`; markup uses native elements and `textContent`. There is no router,
framework or API request. A root-owned theme controller is passed to the navbar;
theme preference, solar calculation and presentation have separate modules.

### Locale architecture

`src/locales/` is the canonical owner of runtime translated UI strings:

- `types.ts` defines `supportedLocales`, the derived `Locale` identity, and the
  shared `LocaleContent` schema.
- `zh-Hant.ts`, `en.ts`, and `ja.ts` each own one complete language, including
  navigation, language self-names, theme and accessibility labels, and completed
  Home/About/Works/Posts copy and footer contact text. Each module uses `satisfies LocaleContent`; missing or incompatible
  fields fail `check:v2:types`.
- `index.ts` exposes the typed registry, `resolveLocale(pathname)`,
  `resolvePage(pathname)`, `getContent(locale)`, and `localeHref(locale, hash, page)`.

The bootstrap selects known Home, About, Works and Posts entries by pathname: the root paths
use `zh-Hant`, `/en/` paths use `en`, and `/ja/` paths use `ja`.
These entries also accept `index.html` and slashless paths.
The resolver's unknown-path ZH-Hant/Home fallback is internal defensive behavior
only; it does not register routes or define HTTP behavior. The HTTP serving layer
returns the shared 404 document without loading the resolver. Invalid internal identities passed to `getContent`
or `localeHref` throw explicitly instead of returning partial content.
Language links retain the current page and fragment, including Home's `#works`
and `#about`, About's `#interests`, and Posts category/article IDs.
There is no router, runtime translation lookup, or translation dependency.

Future v2 page copy belongs in these locale modules, extending the shared schema;
components and pages consume it rather than maintaining independent translations.
Home's static HTML entries own their document metadata and no-JavaScript fallback;
About, Works and Posts HTML templates take those strings from the typed locales at build time.
`content.ts` has been removed because it has no remaining responsibility.

### CSS design system

`src/main.ts` imports only `styles/index.css`, which owns the explicit cascade
order below. No CSS framework, preprocessor or v1 stylesheet is imported.

```text
styles/
├─ index.css           # Ordered imports: foundations, utilities, components, pages
├─ tokens.css          # Canonical primitives and Light/Dark semantic palettes
├─ reset.css           # Sizing, margins, media and native control inheritance
├─ base.css            # Document colors, links and shared visible focus
├─ typography.css      # Body, heading, label, small text and code defaults
├─ layout.css          # Full-height shell and responsive container
├─ utilities.css       # Keyboard skip link only
├─ components/
│  ├─ button.css       # Shared pill buttons, CTA anchors and control variants
│  ├─ navbar.css       # Existing navigation and native theme/language controls
│  ├─ footer.css       # Existing footer
│  ├─ media.css        # Native responsive image presentation
│  ├─ work-card.css    # Reusable open project cards
│  ├─ post-card.css    # Reusable article links, dates and excerpts
│  └─ post-category.css # Semantic category groups
└─ pages/
   ├─ home.css         # Home composition
   ├─ about.css        # About composition
   ├─ works.css        # Works grid composition
   └─ posts.css        # Posts introduction and group spacing
```

Only `tokens.css` owns global design values: semantic colors, opaque surface
treatment, popover shadows, spacing, radii, font families/sizes/weights/leading,
content widths, control/icon sizes, stacking, focus and motion. The existing
`--color-background`, `--color-surface`, `--color-text`, `--color-muted`,
`--color-border`, `--color-accent`, `--color-button` and `--color-focus` names
remain canonical; do not add a second palette or aliases for the same roles.
Light/Dark values and native `color-scheme` remain paired. Surfaces deliberately
use no gradient or glass blur. Add tokens for shared needs, not individual page
adjustments.

`components/button.css` loads before navbar and footer styles. Its `.button`
class provides the shared outlined CTA treatment, with `.button--primary` for
filled CTAs and `.button--quiet` for navigation and disclosure/menu controls.
All variants use `--radius-pill` (`9999px`) for their shape and local focus radius,
plus shared spacing and `--control-size` tokens rather than fixed heights that
prevent text wrapping. Navigation CTAs remain native anchors with their hrefs;
theme buttons and language disclosures retain native `button` and `summary`
semantics. Home's former underline CTAs consume this layer instead of page-owned
button styles, consistently across ZH/EN/JA.

Outlined and primary buttons use `--color-button` for their outline/text or fill,
with `--color-background` as primary text. Hover and `:focus-visible` feedback is
shared; native disabled buttons reduce opacity and use a not-allowed cursor.
The navbar overrides quiet controls to use color-only hover/focus feedback,
without an inset frame or background. Its brand link also uses the button color
on hover/focus without an underline. Keyboard `:focus-visible` outlines remain
visible, and the button layer introduces no transitions or animations.

The page layout breakpoint is `40rem`: tokens reduce gutters from 1.5rem to 1rem
and section spacing from 6rem to 4rem, and Home columns stack. Navigation uses
`48rem`: the Japanese desktop header needs about 704px including its existing
gaps and gutters; 768px leaves room before controls wrap. Keep that navigation
query synchronized in `navbar.ts` and `components/navbar.css`. Use literals because
custom properties cannot supply query conditions. Font sizes use rem; the display heading mixes
rem and viewport sizing within rem bounds so enlarged text can grow. Do not
lock root text sizing or hide horizontal overflow to mask reflow defects.

Native controls keep their appearance unless the shared button or navigation
styles provide their own treatment. List-marker removal is scoped to navigation,
leaving future content lists intact. Keyboard focus uses shared color, width,
offset and radius tokens; the skip link sits above dropdowns. The shell has no transitions,
animations or smooth scrolling. Future optional motion must consume the duration
tokens (zero under `prefers-reduced-motion: reduce`); nonessential keyframes and
smooth scrolling also need an explicit reduced-motion alternative.

Add reusable component styles under `components/` only with a real consumer.
Future page composition belongs in `pages/`, after the shared layers; generic
typography and layout must not acquire page selectors. Keep utilities small.
V1 CSS is reference material only: do not incrementally copy legacy blocks into
this system. Home-specific composition stays in `pages/home.css` and consumes
the shared layers.

The primary About, Works and Posts links point to their matching-language V2 pages.
At 48rem and below, a three-line CSS hamburger replaces the desktop page links
and GitHub link. It opens a native modal dialog at the viewport's left edge,
with the same four links and current-page marker. The close button, backdrop,
Escape and link activation close it. Native modality and explicit Tab wrapping
contain focus; closing restores the trigger, or the brand after desktop resize.
The open dialog locks root scrolling without changing the scroll position.
Language and theme controls remain in the header, wrapping at enlarged text sizes.

The navbar language switcher uses native `details`/`summary` and localized links
from `locales/`. It preserves the current page and fragment across the three
locale entries: Home sections stay on Home, About sections stay on About,
Works links stay on Works, and Posts category/article fragments stay on Posts.
The same control remains in the mobile navbar outside the navigation drawer.
Escape restores trigger focus; outside clicks and focus leaving the disclosure
close it. Tab follows native document order. The disclosure and links work if
enhancement listeners fail after rendering; the application shell itself still
requires JavaScript, with the existing HTML `noscript` fallback.

## Shared theme system

The default preference is **Auto**, which uses
`Intl.DateTimeFormat().resolvedOptions().timeZone` on this device, looks up a
bundled IANA representative coordinate, and calculates today's sunrise/sunset
locally. Sunrise is inclusive and sunset exclusive: `sunrise <= now < sunset`
means Light; other times mean Dark. Civil dates use the device IANA timezone,
including DST, date-line handling and adjacent daylight intervals that cross
midnight at high latitudes. The representative point is approximate
and does not locate the visitor. No Geolocation API, permission prompt, GPS,
IP lookup, geocoding, weather service or external solar API is used.

The three preferences are `auto`, `light` and `dark`. An explicit choice is
stored under the v2-only localStorage key **`huihui-v2-theme`**. Missing or invalid
values mean Auto. Auto's current Light/Dark result is never written as a
preference; a saved Auto is recalculated on every load with the current device
timezone. Light/Dark remain manual overrides until Auto is selected. If storage
is unavailable or full, the page renders and manual choices work for the current
page lifetime. Same-origin localStorage updates synchronize open tabs.

Unknown or unsupported timezones (including non-geographic UTC/fixed offsets),
invalid mapping/clock data, dates outside 1900–2100, and calculation/Intl failures
fall back deterministically to **Light**, keeping the configured preference Auto.
Polar day resolves Light and polar night Dark. No OS color-scheme preference or
network lookup is used as a fallback.

`theme/auto.ts` resolves effective theme and the next known sunrise/sunset.
`theme/controller.ts` applies it, publishes state changes and schedules a single
timer for that transition, capped at one hour to detect active clock/timezone
changes and refresh dates/polar seasons without aggressive polling. Timers stop
while hidden; visibility restoration, window focus and `pageshow` immediately
recompute. Manual modes have no solar timer. `theme/preference.ts` owns storage,
`theme/timezones.ts` owns timezone lookup, and `theme/solar.ts` owns the small
NOAA calculation. The [dataset documentation](src/theme/data/README.md) records
IANA provenance, generation/update instructions, approximation limits and the
independent solar reference used by tests. There is no new runtime dependency.

The compact navbar button displays a Sun SVG for effective Light and a Moon SVG
for effective Dark, even in Auto. Its localized accessible name describes the effective theme;
the menu's checkmark and `menuitemradio` `aria-checked` describe the configured
preference. The menu follows the language control in desktop/mobile Tab order.
Enter/Space opens or selects; arrows, Home and End move among options; Escape
restores trigger focus. Tab, outside click and focus leaving close the menu.
ZH/EN/JA labels live in `locales/`; no permanent Theme text label is displayed.
All pages share Light/Dark semantic tokens and matching `color-scheme` in
`styles/tokens.css`, including visible focus colors tested on both surfaces.
Dark uses a black page background and neutral near-black surfaces; Auto resolving
to Dark uses the same tokens. Light's `--color-button` is blue `#006FDE`, separate
from the existing green `--color-accent` used by other accents. Dark's button
token references `--color-accent`, preserving its light blue `#8FD3FF`. Auto
uses the same button palette as its effective Light or Dark result; OS color
scheme does not select a separate button palette.

Navbar action links, language summaries and theme buttons share the
`navbar-control` height, typography, padding and flex alignment. The language
summary retains native disclosure behavior while its standard/WebKit markers
are visually suppressed. `components/icons.ts` provides four local Tabler
outline SVGs (Sun, Moon, GitHub and selected-item check) from `components/icons.svg`,
which includes the pinned upstream source and MIT notice. The asset import uses
`?no-inline` so Vite emits a same-origin sprite instead of a data URL that SVG
`use` would reject. All use the same 24-unit viewBox, 2-unit stroke
and 1.25rem box, `currentColor`, `aria-hidden` and `focusable="false"`. The GitHub
link retains its visible label; no icon adds a tab stop or remote request.

An external, same-origin classic `theme/bootstrap.ts` bundle runs synchronously
in the document head before styles and the application module. It uses the same
preference and Auto modules, setting `data-theme` before themed content can paint.
The Vite plugin bundles this small entry for development and emits a hashed asset
for builds; it contains no inline code, `eval`, or new CSP permission. This also
works in Firefox, which does not support render-blocking module attributes.
The root controller initializes before app DOM creation and takes over live
updates. With JavaScript disabled the existing light `noscript` fallback remains.

The footer contains copyright and the localized contact label with the existing
public `contact@huihui.dev` mail link. It is shared by Home, About, Works and Posts. No v1
regression assertion is replaced: v2 has its own Playwright configuration and PR
validation job.

## Home milestone

TypeScript, the design system, application shell, locale architecture, and Home
are complete, followed by the About milestone below. Works and Posts are complete in their milestones below; Contact is footer-only.

`pages/home.ts` renders one shared composition for all three locales:

1. **Hero:** Web Design, Website Development and UI / UX positioning, with
   performance, security and privacy as the central promise. Primary Works and
   secondary About fragment links remain native anchors.
2. **Selected work:** huihui.dev and Tier Maker, with readable summaries and
   direct source/tool links. Projects use open columns instead of boxed cards.
3. **Focus:** Web Design, Website Development and UI / UX, at the existing
   `#about` destination, with a link to the full profile.
4. **Engineering principles:** concrete performance, security and privacy
   decisions behind the site.
5. **Practice and interests:** AI-assisted development, Cloudflare and GitHub /
   CI/CD skills alongside a separately headed section for ongoing Apple, OpenAI
   and Web/AI interests that can inform future Posts. These are not new routes.

The full-profile link now opens the matching-language V2 About page. More-work
and tool links still use matching-language pages on `https://huihui.dev`,
explicitly labeled as the current site. These are ordinary same-tab links, not
embedded v1 pages. Home's Hero keeps its useful Works and Focus fragment links.

All Home text belongs to `locales/` and the shared `LocaleContent` schema. The
content describes the current Web/UI direction and existing projects; no v1
markup, styles, scripts or runtime data are imported. Home-specific composition
uses existing typography, spacing, color, radius and control tokens. It removes
the decorative eyebrow, project category micro-labels and abstract Hero sketch.
Normal Home content uses the existing 1.125rem token, including current-site
link context. Hierarchy comes from headings, spacing and restrained rules.
The sole 40rem breakpoint stacks the work, focus, principles and practice columns.

Home uses one h1, five section h2s, and project/topic h3s. Fragment destinations accept
keyboard focus, CTA text wraps, and links keep the shared visible focus style.
`tests/v2/home.spec.ts` covers three locales, desktop/mobile, both themes,
keyboard anchors, current-site destinations, readable typography, no external
resource requests, and 320px with 200% text and reduced motion. The locale browser
contract covers all Home copy; existing shell,
language and theme suites retain their integration coverage.

## About milestone

`pages/about.ts` presents the profile in four open sections: background, web
development practice, hobbies, and music/art preferences. V1's profile data and
About page are content references only. Electronic Engineering, photography,
maimai DX, Arcaea, visual novels and creative interests remain; the simulated
editor, code reveal, media gallery, Steam API and score widgets are not migrated.

The three About HTML entries use the existing MPA build and common `main.ts`
bootstrap. `locales/index.ts` resolves only known HTML entries, with typed `Page`
identities and `localeHref(locale, hash, page)` for native document links. It does
not intercept navigation or implement a client router. A future standalone page
can add its real HTML entries, typed identity, content and page module to the
same shell without introducing placeholder routes. Contact remains footer-only.

`LocaleContent.aboutPage` requires all About strings. The small `pageHtml` Vite
transform fills escaped title, description and `noscript` placeholders from
those same typed locale modules during development and build. HTML owns the
document structure and language attribute; components use `textContent`.
`pages/about.css` uses the existing semantic tokens, shared typography and pill
CTA, and stacks its heading/content columns at the existing 40rem breakpoint.

Focused unit contracts verify entry resolution, missing-translation type errors,
twelve content entries plus one shared error document (thirteen emitted HTML
files) and the content entries' external-only theme bootstrap. About browser coverage
checks all copy, page-preserving language links, Home round trips, shared footer
and theme controls, native keyboard navigation, resource failures, and 320px /
200% text reflow. Existing Home and shared shell suites retain their coverage.
The existing global `_headers`, noindex policy and Beta CD architecture apply
unchanged to the new entries. The strict browser smoke adds exactly the three
built About routes to its allowed documents and applies the same build-byte,
security-header and language checks; local tests do not prove a live deployment.

## Works and media milestone

`pages/works.ts` composes three representative items from `LocaleContent.worksPage`: the
website with its Mount Fuji photographic cover, the existing Tier Maker tool, and
Tsutenkaku and Shiba Inu photography. All three routes use the same native MPA shell and page
module. Navbar Works links open the localized page and mark the current page;
language switching retains Works and the fragment. Home and About content and
CTAs are unchanged. Metadata and noscript text share the typed locales through
`pageHtml`, including complete ZH-Hant, EN and JA copy.

`components/work-card.ts` accepts title, description, an optional native link,
and an optional image definition. It uses an article, h2 and visible text; no
nested controls, hover-only information or fabricated detail routes. Open cards
reuse existing tokens and button styles. Only `pages/works.css` owns the grid.

### Responsive image policy

- `media/types.ts` separates source URLs and intrinsic dimensions (`ImageAsset`)
  from usage (`ImageOptions`: localized alt, sizes, loading and decoding).
- `media/works.ts` owns all current asset imports. Vite emits hashed same-origin
  WebP files; originals are not imported or copied into the V2 build.
- Card candidates are 480, 800 and 1200 pixels wide, with an 800px `src` fallback.
  These cover the current two-column maximum of 536 CSS pixels, mobile widths,
  and common 2x displays, with a deliberate 1200px cap.
- `sizes` matches the 70rem container, 1.5rem desktop gutters, 3rem grid gap, and
  single-column 40rem breakpoint with 1rem mobile gutters. The 73rem condition
  only describes when the container reaches its cap; it is not a new CSS breakpoint.
  Update this definition and browser measurements together if the grid changes.
- Every image has width/height matching its 800px fallback. CSS uses width 100%
  and height auto, preserving the source aspect ratio without cropping. Variant
  heights differ only by pixel rounding. No original-sized background images.
- `createImage` defaults to native lazy loading and async decoding. The first
  website cover is explicitly eager because it can be above the fold. Subsequent
  images are lazy; the browser decides its proximity threshold. No preload or
  unconditional high fetch priority is needed for this initial collection.
- Alt is required, including explicit empty alt for genuinely decorative media.
  Native alt text is the failure fallback; the card text/link remains available.
  There is no error-handler retry, original-image fallback or hidden network loop.
- `<img srcset sizes>` is sufficient for one format without art direction. Add
  `<picture>` only when actual alternate formats or crops justify it. The rules
  follow the [native image attributes](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img).

The new V2 JPG pilot uses only three external source photographs: Fuji,
Tsutenkaku and a Shiba Inu. It has no V1 source/path/identity mapping. The optional
`ImageAsset.highResolution` descriptor is separate from its Pages WebP preview.
Only `media/published.ts` enables public objects after byte/hash/decode validation.
The three pilot descriptors were activated after public verification on 2026-09-16;
the gallery and ordinary dialog previews still use only local WebP assets.
The beta CSP adds exactly `https://assets-beta.huihui.dev` to `img-src`; scripts,
styles, connections and all other directives retain their existing restrictions.

The native image dialog opens with WebP, discloses decimal MB before an explicit
high-resolution action, and assigns a remote image URL only inside that action.
It sets `referrerpolicy="no-referrer"`, adds no CORS attribute, and swaps the image
only after successful decode. Errors/timeouts retain the WebP preview and show
the localized error while keeping the high-resolution action disabled and
focusable. There is no in-page retry; selecting or opening an image starts from
its normal preview state. Close, Escape, keyboard focus return and image switching
remain available while loading; generation tokens reject stale completions. Normal browsing and
preview opening never depend on R2. See the [pilot operations](tools/README.md)
for source preservation, controlled upload, activation and verified beta infrastructure.

Works tests cover route/copy parity, native links and focus, image dimensions,
asset decoding, actual selected sources at desktop/mobile and 2x density, missing
images, both themes and 320px/200% reflow. Strict local beta smoke includes all
twelve content documents and a separate expected-404 contract, and verifies every emitted WebP against its built SHA-256;
unknown requests and changed image bytes remain rejected.

## Posts milestone

Posts is a native MPA at `/posts/`, `/en/posts/`, and `/ja/posts/`.
Navbar links use the active language and mark Posts as the current page.
Language switching retains Posts and its category or article fragment. Only
known entries (including slashless and `index.html` forms) resolve as Posts;
unknown paths do not register a new page. Contact stays in the shared footer.

### Content inventory and ownership

V1's `js/posts-data.js` was inspected as content only. It contains seven dated
short updates with no title field or individual article routes. They appear at
`/posts/`, `/en/posts/`, and `/ja/posts/`; the V1 renderer exposes data IDs,
not article fragment targets. V2 retains those stable IDs and source dates,
provides editorial titles and plain-text excerpts based on all seven updates,
and gives each readable entry a native permalink on the localized Posts page.
There are no invented detail pages or external requests when reading Posts.
V1 photos, hashtags, markup, scripts and widgets are not imported.

| Date | Source update / V2 title topic | Category |
| --- | --- | --- |
| 2026-08-09 | Ave Mujica “Exitus” Taipei DAY2; thanks for the concert | Music |
| 2026-07-31 | Arcaea Course Mode Phase 10 clear | Rhythm games |
| 2026-06-28 | Arcaea: Grievous Lady, Tempestissimo and Lament Rain EX scores | Rhythm games |
| 2026-06-27 | Arcaea Potential 12.00, playing since 2021 and Fracture Ray EX | Rhythm games |
| 2026-05-03 | Arcaea Potential 11.90 and Aether Crest: Astral EX | Rhythm games |
| 2026-04-19 | Arcaea Cyaegha EX+ | Rhythm games |
| 2026-04-14 | Hello, World! | Journal |

- `src/posts/registry.ts` owns the canonical post IDs, optional publication
  dates, typed category identities/order, and `postHref(locale, id)`.
  Entries stay newest first within each category. No date is inferred when absent.
- `LocaleContent.postsPage` owns metadata, introduction, category labels and
  every article title/excerpt. Its Records are keyed by `PostCategory` and the
  registry-derived `PostId`; all three locale modules must supply every entry.
  Adding a post or category therefore requires matching translated copy.
- `components/post-card.ts` renders an article with a linked h3, a localized
  UTC calendar date in `time[datetime]`, and its text. Its title link is a
  permalink to the visible short entry, not a claim of a longer article.
- `components/post-category.ts` renders an explicitly named section with an
  h2 and the category's articles. Three groups are enough for this inventory;
  all articles remain visible, without filter state or animation.
- `pages/posts.ts` composes one h1 and these shared components. Component CSS
  owns article/group presentation; `pages/posts.css` owns page spacing.
  Existing tokens, focus styles and theme controls apply. The shared navbar
  allows its three primary links to wrap at enlarged text sizes.

The focused `tests/unit/v2-posts.test.mjs` verifies unique IDs and valid dates,
category membership, complete localized fields, destinations and unknown paths.
The existing negative TypeScript fixture rejects incomplete copy and invalid
category/post identities. `tests/v2/posts.spec.ts` covers every locale in all
three browsers, native article links, language fragments, Navbar round trips,
keyboard focus, Light/Dark/Auto, desktop/mobile, 320px/200% reflow, reduced motion,
and resource errors. Build inventories and strict built-beta smoke include all
12 content documents plus the shared 404 error document; exact HTML/asset bytes
and CSP negative controls remain required.
