export interface ImageSource {
  readonly src: string;
  readonly width: number;
}

// URLs may be Vite imports today or reviewed CDN URLs in a future asset registry.
export interface ImageAsset {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly sources: readonly ImageSource[];
}

export interface ImageOptions {
  readonly asset: ImageAsset;
  readonly alt: string;
  readonly sizes: string;
  readonly loading?: "eager" | "lazy";
  readonly decoding?: "async" | "sync" | "auto";
}
