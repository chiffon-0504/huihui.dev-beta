import type { Coordinates } from "./solar";
import { timezoneCoordinates } from "./data/timezone-coordinates";

export function resolveTimeZone(): string | undefined {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === "string" && timeZone.length > 0 ? timeZone : undefined;
  } catch {
    return undefined;
  }
}

export function lookupCoordinates(timeZone: string): Coordinates | undefined {
  if (!Object.hasOwn(timezoneCoordinates, timeZone)) return undefined;
  const coordinates = timezoneCoordinates[timeZone];
  if (!coordinates) return undefined;
  const [latitude, longitude] = coordinates;
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    return undefined;
  }
  return { latitude, longitude };
}
