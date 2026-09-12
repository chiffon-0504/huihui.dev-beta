# v2 application shell

An independent Vanilla TypeScript application. The existing v1 site and its
deployment configuration remain in place while v2 is built. Nothing from the v1
CSS, scripts, widgets, or vendor bundle is imported by this application.

## Local development

Use Node.js 24 and install dependencies from the repository root with `npm ci`.

- `npm run dev:v2` starts the v2 development server.
- `npm run check:ts` checks the strict TypeScript application.
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
checking; `check:ts` continues to check the application. The theme spec loads the
shared `.mjs` CSP helper with native asynchronous `import()` so it remains ESM
instead of passing through a CommonJS `require`. Pure solar and timezone tests
remain in the focused Vitest suite. The theme browser spec uses the production calculator
only to exercise real sunrise/sunset transitions.

The v2 server serves `/`, `/en/`, and `/ja/`. The generated `v2/dist/` is a
standalone site root; opening the source HTML directly or using the v1 static
server does not compile TypeScript. No Pages or production build settings are
changed by this PR. Hosting configuration and security-header delivery must be
reviewed when v2 is selected for deployment; browser tests currently enforce the
existing root `_headers` CSP on the locally built pages.

## Structure

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

The compact navbar button displays `☀︎` for effective Light and `☾` for effective
Dark, even in Auto. Its localized accessible name describes the effective theme;
the menu's checkmark and `menuitemradio` `aria-checked` describe the configured
preference. The menu follows the language control in desktop/mobile Tab order.
Enter/Space opens or selects; arrows, Home and End move among options; Escape
restores trigger focus. Tab, outside click and focus leaving close the menu.
ZH/EN/JA labels live in `content.ts`; no permanent Theme text label is displayed.
All pages share Light/Dark semantic tokens and matching `color-scheme` in
`styles/tokens.css`, including visible focus colors tested on both surfaces.

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
