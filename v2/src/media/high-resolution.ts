import type { HighResolution } from "./types";

export const betaAssetOrigin = "https://assets-beta.huihui.dev";
export const photoIds = ["fuji", "tsutenkaku", "shiba"] as const;
export type PhotoId = (typeof photoIds)[number];

export function validateHighResolution(value: HighResolution, id: string): HighResolution {
  if (!photoIds.includes(id as PhotoId) || value.mime !== "image/jpeg"
    || !/^[a-f0-9]{64}$/.test(value.sha256)
    || ![value.width, value.height, value.bytes].every((n) => Number.isSafeInteger(n) && n > 0)
    || value.url !== `${betaAssetOrigin}/photos/${id}-${value.sha256}.jpg`) {
    throw new Error("Invalid beta high-resolution descriptor");
  }
  return value;
}

export function fileSizeLabel(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
