# V2 pilot WebP previews

The active V2 library is newly generated from three explicitly supplied external
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
