import fuji480 from "./assets/fuji-480.webp?no-inline";
import fuji800 from "./assets/fuji-800.webp?no-inline";
import fuji1200 from "./assets/fuji-1200.webp?no-inline";
import yokohama480 from "./assets/yokohama-480.webp?no-inline";
import yokohama800 from "./assets/yokohama-800.webp?no-inline";
import yokohama1200 from "./assets/yokohama-1200.webp?no-inline";
import type { ImageAsset } from "./types";

export const workImages = {
  fuji: {
    src: fuji800, width: 800, height: 492,
    sources: [{ src: fuji480, width: 480 }, { src: fuji800, width: 800 }, { src: fuji1200, width: 1200 }],
  },
  yokohama: {
    src: yokohama800, width: 800, height: 461,
    sources: [{ src: yokohama480, width: 480 }, { src: yokohama800, width: 800 }, { src: yokohama1200, width: 1200 }],
  },
} satisfies Readonly<Record<string, ImageAsset>>;

// Keep in sync with the 70rem container, gutters and 3rem Works grid gap.
export const workImageSizes = "(max-width: 40rem) calc(100vw - 2rem), (max-width: 73rem) calc((100vw - 6rem) / 2), 33.5rem";
