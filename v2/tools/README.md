# Beta JPG pilot operations

This is a new V2 library containing exactly `fuji`, `tsutenkaku`, and `shiba`.
Source JPGs are external inputs, never repository files, CI inputs or artifacts.
EXIF/GPS, dates, camera/lens information, orientation and other photographic
metadata are intentionally preserved by uploading the exact source bytes.
No alternate master, sanitized layer or compressed JPG is created.

## Current activation state

Repository support and Pages previews are available. `media/published.ts` is
empty: the website has no active high-resolution descriptors or remote JPG URLs.
The viewer works with Pages previews; its high-resolution control is hidden
until an object passes explicit public verification and activation.

Read-only Cloudflare checks on 2026-09-16 returned R2 API error `10042: Please
enable R2 through the Cloudflare Dashboard`. Bucket inventory is unavailable;
this is not proof of an empty bucket list. The `huihui.dev` zone is active, and
the exact `assets-beta.huihui.dev` DNS query returned zero records. No Cloudflare
configuration, object upload, production resource or API Worker was changed.

## Required external configuration (separate authorization)

1. An account operator must enable R2 in the Dashboard, including any account
   subscription/billing step. This helper never provisions resources.
2. Inspect again, then create or verify the beta-only bucket
   `huihui-v2-media-beta`. Do not add lifecycle deletion or sync cleanup.
3. Attach the custom domain `assets-beta.huihui.dev` in the `huihui.dev` zone;
   verify active TLS/domain status and its managed DNS record. Keep r2.dev
   disabled. Do not configure `assets.huihui.dev` or a Worker proxy.
4. Preserve source bytes: do not apply image transformation, Polish, redirects
   or header rewrites to this hostname. Verify inherited zone rules before use.
   Store `Content-Type: image/jpeg` and
   `Cache-Control: public, max-age=31536000, immutable` on each object. Public
   verification requires these live headers and identical bytes. No CORS policy
   is needed for the viewer's ordinary image loading.
5. Use a bucket-scoped beta S3 credential through protected process environment
   injection: `R2_BETA_ACCOUNT_ID`, `R2_BETA_ACCESS_KEY_ID`, and
   `R2_BETA_SECRET_ACCESS_KEY`. Never put values in shell commands, Vite env,
   logs, screenshots, committed files or ordinary/fork workflows. No production
   credential is accepted by policy. The helper fixes the bucket and hostname.

Cloudflare documents [custom domains and public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/),
[custom-domain caching](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/),
and [conditional S3 operations](https://developers.cloudflare.com/r2/api/s3/api/).
Actual live behavior still requires verification; documentation is not evidence
that this pilot has been deployed.

## Local workflow

Use Node.js 24 and an existing authoring runtime with Sharp. Point
`MEDIA_NODE_MODULES` at that runtime's `node_modules` directory. The pilot used
Sharp 0.35.4, libvips 8.18.6 and libwebp 1.6.0. No package is installed implicitly
and no authoring dependency is added to the site. Consistent encoder versions
and parameters are required for byte-for-byte reproducible previews.

```text
node v2/tools/media.mjs prepare --fuji <external-JPG> --tsutenkaku <external-JPG> --shiba <external-JPG>
```

`prepare` is entirely offline: validate JPEG signature/format, fully decode,
inspect orientation/dimensions, hash the source, auto-orient derivatives and
generate widths 480/800/1200 with Lanczos3, no enlargement, WebP quality 80 and
effort 6. It decodes every output and records dimensions, bytes and hashes in
`src/media/pilot-sources.ts`, without local paths. A smaller future input needs
review of the actual candidate widths; this pilot's sources exceed 1200px.
It never uploads, activates a descriptor or writes a JPEG. Source hashes are
checked again after processing. Derivative metadata need not match the JPG.

After separate beta write authorization and configuration:

```text
node v2/tools/media.mjs publish --fuji <external-JPG> --tsutenkaku <external-JPG> --shiba <external-JPG>
node v2/tools/media.mjs activate --fuji <external-JPG> --tsutenkaku <external-JPG> --shiba <external-JPG>
```

`publish` checks that sources and previews still match the prepared inventory.
It reads each immutable object through authenticated S3, reuses identical bytes,
and stops on conflicting bytes, bad headers or ambiguous absence. For HTTP 404
only, it conditionally uploads with `If-None-Match: *`, then reads the object
again. A concurrent HTTP 412 causes verification, never overwrite. It then GETs
the exact public custom-domain URL with redirects forbidden, checking HTTP 200,
MIME, cache policy, Content-Length if present, full byte size/SHA-256, JPEG decode
and oriented dimensions. It prints only safe verification fields. There are no
automatic retries, deletes, sync actions or client credentials.

`activate` independently repeats public verification for all three photos and
only then writes `src/media/published.ts`. It verifies prepared inventory first.
No partial activation is written if a photo fails. Review this exact diff before
commit/PR. Until activation, the source inventory is descriptive data, never
permission for browser requests. Only `published.ts` can activate the viewer.
Run focused tests/build again after activation. Publication must precede activation,
PR merge and Pages deployment; never merge with a promise to upload later.

## Verification and live acceptance

```text
npx vitest run tests/unit/v2-
npm run build:v2
npx playwright test --config=playwright.v2.config.mjs tests/v2/works.spec.ts tests/v2/image-viewer.spec.mjs
```

Run the existing built-beta/CSP suite using `V2_BETA_LOCAL=1` and
`playwright.v2-beta.config.mjs` as described in the V2 README. Its strict normal
browsing guard remains self-only and rejects any accidental R2 request. Existing
enforcing, Report-Only and no-CSP negative controls remain intact. The viewer
fixture compiles the real viewer with synthetic JPEG descriptors, intercepts all
remote bytes, and runs in all three V2 browsers under the real V2 CSP. It never
activates synthetic data in the site or publishes original JPGs as CI artifacts.

After configuration/upload/activation and an authorized beta merge/deployment,
use an API-verified exact-SHA immutable Pages URL. Run ordinary Beta CD unchanged
to establish the Pages build identity and zero-external-request contract. Then
perform a separate explicit acceptance for all three viewer controls: disclosed
MB, one intended JPG request after click, no referrer/CORS, successful decode,
no console/security error, and close/focus behavior. Run `activate` verification
again to compare public/source hashes and actual cache headers. Do not download
the future library on unrelated PRs. Live acceptance is pending for this pilot;
local interception does not prove DNS, TLS, R2 or deployed Pages behavior.
