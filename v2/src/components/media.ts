import { element } from "../dom";
import type { ImageOptions } from "../media/types";

export function createImage({ asset, alt, sizes, loading = "lazy", decoding = "async" }: ImageOptions): HTMLImageElement {
  const image = element("img", "media-image");
  image.alt = alt;
  image.width = asset.width;
  image.height = asset.height;
  image.loading = loading;
  image.decoding = decoding;
  // Set selection hints before src, avoiding an unnecessary fallback request.
  image.sizes = sizes;
  image.srcset = asset.sources.map((source) => `${source.src} ${source.width}w`).join(", ");
  image.src = asset.src;
  return image;
}
