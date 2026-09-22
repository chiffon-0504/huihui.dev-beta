# Locales

Canonical v2 UI copy lives in `zh-Hant.ts`, `en.ts`, and `ja.ts`, checked against
the single `LocaleContent` schema in `types.ts`. `index.ts` exposes locale
selection for the twelve built Home/About/Works/Posts × ZH-Hant/EN/JA entries,
complete content, and links preserving the current page and fragment. About,
Works and Posts HTML metadata and the no-JavaScript fallback also consume this
schema through the Vite HTML transform. Posts category labels and article
titles/excerpts belong to `LocaleContent.postsPage`; identities, dates and
destinations belong to `../posts/registry.ts`. Contact remains footer-only.

The private `/tools/jev/` entry uses named `jev` exports from those same three
language modules, checked against `JevContent` in `jev.ts`. This keeps private
form copy out of the public `LocaleContent` bundle and page/navigation inventory.
Its in-page language control preserves drafts without registering public routes.

See the [v2 locale architecture](../../README.md#locale-architecture) for ownership
and route rules. Do not duplicate these strings in components or import v1 locales.
