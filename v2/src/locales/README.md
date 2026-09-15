# Locales

Canonical v2 UI copy lives in `zh-Hant.ts`, `en.ts`, and `ja.ts`, checked against
the single `LocaleContent` schema in `types.ts`. `index.ts` exposes locale
selection for built Home/About/Works entries, complete content, and links preserving
the current page and fragment. About and Works HTML metadata and the no-JavaScript fallback
also consume this schema through the Vite HTML transform.

See the [v2 locale architecture](../../README.md#locale-architecture) for ownership
and route rules. Do not duplicate these strings in components or import v1 locales.
