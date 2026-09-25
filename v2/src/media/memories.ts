import preview320 from "./assets/ave-mujica-exitus-taipei-day2-320.webp?no-inline";
import preview640 from "./assets/ave-mujica-exitus-taipei-day2-640.webp?no-inline";
import type { ImageAsset } from "./types";

export const memoryImage = {
  id: "ave-mujica-exitus-taipei-day2",
  src: preview640,
  width: 640,
  height: 480,
  sources: [{ src: preview320, width: 320 }, { src: preview640, width: 640 }],
} satisfies ImageAsset;

// Match the 20rem window, its border/padding and the full-width mobile layout.
export const memoryImageSizes = "(max-width: 40rem) calc(100vw - 4rem - 2px), calc(18rem - 2px)";
