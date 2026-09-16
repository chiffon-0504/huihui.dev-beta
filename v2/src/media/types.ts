export interface ImageSource {
  readonly src: string;
  readonly width: number;
}

// URLs may be Vite imports today or reviewed CDN URLs in a future asset registry.
export interface ImageAsset {
  readonly id?: string;
  readonly highResolution?: HighResolution;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly sources: readonly ImageSource[];
}

export interface HighResolution {
  readonly url: string;
  readonly mime: "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ImageOptions {
  readonly asset: ImageAsset;
  readonly alt: string;
  readonly sizes: string;
  readonly loading?: "eager" | "lazy";
  readonly decoding?: "async" | "sync" | "auto";
}
