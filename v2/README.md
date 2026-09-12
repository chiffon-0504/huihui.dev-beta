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
- `npm run test:unit` includes the v2 locale and contrast contracts.

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
framework, global mutable application state, or API request.

`styles/` separates tokens, reset, base, layout, component styles, and Home
styles. The sole initial responsive breakpoint is `40rem`, documented in
`tokens.css` and used directly in media queries because CSS custom properties
cannot supply media-query conditions. No animation or transition is included.

The primary links point to the Home `#works` and `#about` placeholders until
those pages are implemented. All navigation remains visible on mobile and wraps
at narrow widths or enlarged text. The actions area can later accommodate search
without adding a search control or reserving a visible empty slot now.

The footer contains copyright and language links. Home copy and both content
sections are provisional. No v1 regression assertion is replaced: v2 has its own
Playwright configuration and PR validation job.
