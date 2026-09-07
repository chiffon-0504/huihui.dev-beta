# Vendored dependencies

This directory contains the small set of third-party browser dependencies that
the site serves locally. Vendoring keeps the browser runtime deterministic,
avoids runtime CDN dependencies, and allows the exact files used by the site to
be reviewed in the repository.

[`manifest.json`](manifest.json) is the machine-readable authoritative
provenance inventory. It records each package, its pinned version, license,
official npm package tarball, tarball SHA-256, upstream repository/tag, and the
upstream path and SHA-256 of every included file. The recorded hashes are
byte-level checks that make accidental edits, line-ending changes, and
unexpected replacements detectable.

## Packages

| Package | Version | Upstream project | Package source | License |
| --- | --- | --- | --- | --- |
| `prismjs` | `1.30.0` | [PrismJS/prism](https://github.com/PrismJS/prism/tree/v1.30.0) | [npm tarball](https://registry.npmjs.org/prismjs/-/prismjs-1.30.0.tgz) | MIT ([local text](prism/LICENSE)) |
| `html2canvas` | `1.4.1` | [niklasvh/html2canvas](https://github.com/niklasvh/html2canvas/tree/v1.4.1) | [npm tarball](https://registry.npmjs.org/html2canvas/-/html2canvas-1.4.1.tgz) | MIT ([local text](html2canvas/LICENSE)) |
| `overlayscrollbars` | `2.16.0` | [KingSora/OverlayScrollbars](https://github.com/KingSora/OverlayScrollbars/tree/v2.16.0) | [npm tarball](https://registry.npmjs.org/overlayscrollbars/-/overlayscrollbars-2.16.0.tgz) | MIT ([local text](overlayscrollbars/LICENSE)) |

The included runtime files are intended to remain byte-for-byte copies of the
recorded upstream package files. The local LICENSE files are included for the
corresponding package and are also recorded in the manifest.

## Safe update procedure

To update a vendored dependency:

1. Choose and record the exact upstream package version.
2. Obtain the official package artifact from the recorded package source.
3. Verify and record the artifact's SHA-256 checksum.
4. Extract only the required upstream runtime files and LICENSE.
5. Preserve the upstream file bytes exactly; do not reformat, minify, or
   normalize line endings.
6. Update `vendor/manifest.json` with the version, source, repository/tag, and
   upstream paths.
7. Recompute every recorded per-file SHA-256 value from the repository bytes.
8. Run the vendor contract tests and the applicable JavaScript checks.
9. Review the diff for unexpected generated, minified, or unrelated files.

Do not add network downloads to normal unit tests or CI merely to re-prove
provenance. Validation should remain deterministic and offline-capable with
respect to upstream npm artifacts.
