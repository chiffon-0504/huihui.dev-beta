# V2 local WebP previews

## Works pilot

The Works pilot library is newly generated from three explicitly supplied external
JPGs: `fuji`, `tsutenkaku`, and `shiba`. No V1 source paths or compatibility mapping
are used. Only these nine previews are imported by `../works.ts`.

Each source yields 480x640, 800x1067 and 1200x1600 WebP previews. Preparation uses
Sharp 0.35.4 / libvips 8.18.6 / libwebp 1.6.0, EXIF auto-orientation, Lanczos3,
no enlargement, quality 80 and effort 6. Exact bytes, dimensions, source hashes
and preview hashes are recorded in `../pilot-sources.ts`. The source JPG bytes,
including photographic EXIF/GPS metadata, are intentionally left unchanged and
outside Git. No JPG is copied into the site or its build.

The previously tracked Yokohama WebP files are dormant legacy V2 artifacts and
are neither imported nor emitted; they are not part of this three-photo pilot.
No V1 image or architecture was modified. See [pilot operations](../../../tools/README.md)
for offline preparation and separately authorized publication/activation.

Photographs retain the repository's media licensing exclusions.

## Home memory

The supplied concert PNG is imported only through `../memories.ts` as two local
responsive WebPs. Its original 8064x6048 (4:3) pixels are resized without cropping
or enlargement, using the same Sharp 0.35.4 pipeline: auto-orientation,
Lanczos3, WebP quality 80 / effort 6. No photographic metadata is copied.
The original PNG remains outside Git (26,951,800 B; SHA-256
`fdfaf2ac89b1da1a71f7053614134310ae72159e3ea248b83c9f296df35fc5b8`).

| Asset | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| ave-mujica-exitus-taipei-day2-320.webp | 320x240 | 11,758 | `1ea21bbeea1fd112dfd821dd281e97f388810afdd1aad505c080f57213e81876` |
| ave-mujica-exitus-taipei-day2-640.webp | 640x480 | 41,396 | `d56fb79feb16c2f5b16eba64b937a543011ab190aa355a3803fc2c0483dd324d` |

The existing `ImageAsset` / `createImage` path supplies dimensions, srcset,
sizes, lazy loading and async decoding. Home displays the photo and its two
original caption lines directly; there is no viewer or high-resolution URL.
