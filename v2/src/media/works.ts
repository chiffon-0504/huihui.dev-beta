import fuji480 from "./assets/fuji-480.webp?no-inline";
import fuji800 from "./assets/fuji-800.webp?no-inline";
import fuji1200 from "./assets/fuji-1200.webp?no-inline";
import tsutenkaku480 from "./assets/tsutenkaku-480.webp?no-inline";
import tsutenkaku800 from "./assets/tsutenkaku-800.webp?no-inline";
import tsutenkaku1200 from "./assets/tsutenkaku-1200.webp?no-inline";
import shiba480 from "./assets/shiba-480.webp?no-inline";
import shiba800 from "./assets/shiba-800.webp?no-inline";
import shiba1200 from "./assets/shiba-1200.webp?no-inline";
import type { ImageAsset } from "./types";
import { pilotSources } from "./pilot-sources";
import { verifiedHighResolution } from "./published";
import { validateHighResolution, type PhotoId } from "./high-resolution";

function photo(id: PhotoId, urls: readonly string[]): ImageAsset {
  const metadata = pilotSources[id];
  const highResolution = verifiedHighResolution[id];
  if (highResolution && (highResolution.sha256 !== metadata.sha256 || highResolution.bytes !== metadata.bytes
    || highResolution.width !== metadata.width || highResolution.height !== metadata.height)) {
    throw new Error("Published JPEG does not match the prepared preview source");
  }
  return { id, src: urls[1]!, width: metadata.variants[1].width, height: metadata.variants[1].height,
    sources: urls.map((src, i) => ({ src, width: metadata.variants[i]!.width })),
    ...(highResolution ? { highResolution: validateHighResolution(highResolution, id) } : {}),
  };
}

export const workImages = {
  fuji: photo("fuji", [fuji480, fuji800, fuji1200]),
  tsutenkaku: photo("tsutenkaku", [tsutenkaku480, tsutenkaku800, tsutenkaku1200]),
  shiba: photo("shiba", [shiba480, shiba800, shiba1200]),
} satisfies Readonly<Record<string, ImageAsset>>;

// Keep in sync with the 70rem container, gutters and 3rem Works grid gap.
export const workImageSizes = "(max-width: 40rem) calc(100vw - 2rem), (max-width: 73rem) calc((100vw - 6rem) / 2), 33.5rem";
