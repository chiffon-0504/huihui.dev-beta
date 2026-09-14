# Locales

Canonical v2 UI copy lives in `zh-Hant.ts`, `en.ts`, and `ja.ts`, checked against
the single `LocaleContent` schema in `types.ts`. `index.ts` exposes locale
selection, complete content, and fragment-preserving links.

See the [v2 locale architecture](../../README.md#locale-architecture) for ownership
and route rules. Do not duplicate these strings in components or import v1 locales.
