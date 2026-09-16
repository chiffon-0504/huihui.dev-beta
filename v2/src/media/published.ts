import type { HighResolution } from "./types";
import type { PhotoId } from "./high-resolution";

// Populated only by the explicit activation command after public byte verification.
export const verifiedHighResolution: Partial<Record<PhotoId, HighResolution>> = {};
