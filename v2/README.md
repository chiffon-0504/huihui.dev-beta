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
- `npm run build:v2` typechecks and builds the three HTML entries into `v2/dist/`.
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

The v2 server serves `/`, `/en/`, and `/ja/`. The generated `v2/dist/` is a
standalone site root; opening the source HTML directly or using the v1 static
server does not compile TypeScript. Vite copies `public/_headers` into the build.
This self-only CSP, noindex policy and revalidation headers apply to v2 beta.
Existing shell tests also retain coverage under the root v1 `_headers` policy.

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
| Custom domain | `beta.huihui.dev` |
| Pages domain | `huihuidev-beta.pages.dev` |

Cloudflare installs the repository dependencies and builds the three routes
`/`, `/en/`, and `/ja/`. Git integration is the only Pages publication path;
there is no separate Direct Upload project or manual GitHub Pages deploy job.
The Dashboard build settings must be updated by an authorized account operator;
repository changes alone do not switch the hosted build from the root v1 site.

[Beta CD](../.github/workflows/beta-cd.yml) retains the existing exact commit,
canonical Pages deployment, active domain and required beta Worker gates. It
builds the expected v2 assets and runs two Chromium security contracts, then
rechecks the active Pages identity:

- **Native Pages strict contract:** the quiescence gate supplies the immutable
  URL of the successful canonical deployment for the exact workflow SHA. The
  browser compares navigation HTML with the checkout build and reads every
  emitted JS/CSS/SVG asset through same-origin fetch under delivered CSP to
  compare SHA-256 digests with build bytes. It rejects non-build requests before
  dispatch,
  verifies delivered security headers, and rejects every CSP violation and
  console error. Enforce, Report-Only and no-CSP isolated probes run here.
- **Custom-domain contract:** `https://beta.huihui.dev` runs the same three-locale
  desktop/mobile, theme, language, build-byte and security-header checks. The
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
`../vite.v2.config.mjs` handles browser bundles, CSS/SVG imports, the classic theme
bootstrap and the three HTML entries. No additional compiler, bundler or
framework dependency is needed.

```text
v2/
├─ src/
│  ├─ main.ts          # Existing application bootstrap
│  ├─ components/     # Existing shared UI components
│  ├─ services/       # Reserved for future service clients
│  ├─ utils/          # Reserved for future reusable utilities
│  ├─ locales/        # Reserved for future i18n modules
│  ├─ types/          # Reserved for future shared application types
│  ├─ pages/          # Existing page modules
│  ├─ theme/          # Existing theme implementation
│  ├─ styles/         # Existing v2 CSS
│  ├─ content.ts      # Current typed localized content
│  └─ dom.ts          # Current DOM helpers
├─ en/index.html
├─ ja/index.html
├─ index.html
├─ public/
├─ tsconfig.json
└─ README.md
```

The latest main already includes a v2 shell, styles and localized content. The
foundation follow-up preserves those implementations and reserves the missing
module boundaries with documentation only. It does not migrate content or DOM
helpers, add service clients, or rebuild pages. V1 remains the active production
site while v2 development continues; its root HTML/CSS/JavaScript and release
flow remain independent of these TypeScript commands.

`src/main.ts` composes DOM components from `components/navbar.ts`,
`components/footer.ts`, and `pages/home.ts`. Shared localized copy lives in
`content.ts`; markup uses native elements and `textContent`. There is no router,
framework or API request. A root-owned theme controller is passed to the navbar;
theme preference, solar calculation and presentation have separate modules.

`styles/` separates tokens, reset, base, layout, component styles, and Home
styles. The sole initial responsive breakpoint is `40rem`, documented in
`tokens.css` and used directly in media queries because CSS custom properties
cannot supply media-query conditions. No animation or transition is included.

The primary links point to the Home `#works` and `#about` placeholders until
those pages are implemented. All navigation remains visible on mobile and wraps
at narrow widths or enlarged text. The actions area can later accommodate search
without adding a search control or reserving a visible empty slot now.

The navbar language switcher uses native `details`/`summary` and localized links
from `content.ts`. It preserves the current Home fragment across the three locale
entries, including `#works` and `#about`; v2 has no separate localized subpages yet.
The same control remains in the wrapping mobile navbar (there is no drawer).
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
ZH/EN/JA labels live in `content.ts`; no permanent Theme text label is displayed.
All pages share Light/Dark semantic tokens and matching `color-scheme` in
`styles/tokens.css`, including visible focus colors tested on both surfaces.
Dark uses a black page background and neutral near-black surfaces; Auto resolving
to Dark uses the same tokens. Light's color palette is unchanged.

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

The footer contains copyright. Home copy and both content
sections are provisional. No v1 regression assertion is replaced: v2 has its own
Playwright configuration and PR validation job.
