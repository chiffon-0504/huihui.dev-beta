import type { HighResolution } from "./types";
import type { PhotoId } from "./high-resolution";

// Public JPEG bytes verified before activation.
export const verifiedHighResolution: Partial<Record<PhotoId, HighResolution>> = {
  "fuji": {
    "url": "https://assets-beta.huihui.dev/photos/fuji-28cca5fead47134e1b831576476e6ba8d82893e20d236506429fd6a227fe96ed.jpg",
    "mime": "image/jpeg",
    "width": 3024,
    "height": 4032,
    "bytes": 1587326,
    "sha256": "28cca5fead47134e1b831576476e6ba8d82893e20d236506429fd6a227fe96ed"
  },
  "tsutenkaku": {
    "url": "https://assets-beta.huihui.dev/photos/tsutenkaku-afd52514e34cb452d2894bcb4f1ec8d1236e935510e82975810b4be500f6dae4.jpg",
    "mime": "image/jpeg",
    "width": 3024,
    "height": 4032,
    "bytes": 1963940,
    "sha256": "afd52514e34cb452d2894bcb4f1ec8d1236e935510e82975810b4be500f6dae4"
  },
  "shiba": {
    "url": "https://assets-beta.huihui.dev/photos/shiba-9b099a2c6c4a11389b49e5940b5b3dd6d200fb97674ecec4055c25ad4305d0f3.jpg",
    "mime": "image/jpeg",
    "width": 4284,
    "height": 5712,
    "bytes": 3257044,
    "sha256": "9b099a2c6c4a11389b49e5940b5b3dd6d200fb97674ecec4055c25ad4305d0f3"
  }
};
