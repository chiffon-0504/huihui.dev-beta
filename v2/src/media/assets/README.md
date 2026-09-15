# Works image derivatives

These are bounded derivatives of repository-owned photographs, not new artwork:

| Asset | Existing source | Widths | Encoding |
| --- | --- | --- | --- |
| `fuji-*.webp` | `images/2001_w.webp` | 480, 800, 1200 | WebP quality 80, effort 6 |
| `yokohama-*.webp` | `images/2003_w.webp` | 480, 800, 1200 | WebP quality 80, effort 6 |

Generated from the originals with Sharp's `resize({ width, withoutEnlargement:
true }).webp({ quality: 80, effort: 6 })`, preserving aspect ratio, with no crop,
upscaling, or retained metadata. Sharp was available in the authoring runtime;
it is not a project or build dependency. No generation step runs during build.
The photographs retain the repository's existing media licensing exclusions.

Only these derivatives are imported by `../works.ts`. The original images stay
outside the V2 build. When replacing a photograph, regenerate all three widths,
update its fallback dimensions and localized alt, and run the Works image tests.
See [the media policy](../../../README.md#responsive-image-policy).
