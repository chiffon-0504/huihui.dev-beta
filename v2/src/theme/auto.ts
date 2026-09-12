import { calculateSolarTimes, type Coordinates, type SolarDate, type SolarTimes } from "./solar";
import { lookupCoordinates } from "./timezones";

export interface AutoTheme {
  readonly effective: "light" | "dark";
  readonly nextTransition?: number;
}

const DAY = 86_400_000;

function calendarDate(formatter: Intl.DateTimeFormat, time: number): SolarDate {
  const parts = formatter.formatToParts(time);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function dateAt(time: number): SolarDate {
  const date = new Date(time);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function solarDay(date: SolarDate, coordinates: Coordinates, formatter: Intl.DateTimeFormat): SolarTimes | undefined {
  const midnight = Date.UTC(date.year, date.month - 1, date.day);
  // A civil timezone may sit on the other side of the date line from its
  // longitude (e.g. Kiritimati). Match the solar noon to the actual civil day.
  for (const offset of [0, -1, 1]) {
    const times = calculateSolarTimes(dateAt(midnight + offset * DAY), coordinates);
    if (!times) continue;
    const local = calendarDate(formatter, times.solarNoon);
    if (local.year === date.year && local.month === date.month && local.day === date.day) return times;
  }
  return undefined;
}

export function resolveAutoTheme(now: number, timeZone: string | undefined): AutoTheme {
  // Deterministic fallback; never turn an Auto result into a saved preference.
  const fallback: AutoTheme = { effective: "light" };
  try {
    if (!Number.isFinite(now) || !timeZone) return fallback;
    const coordinates = lookupCoordinates(timeZone);
    if (!coordinates) return fallback;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "numeric", day: "numeric",
    });
    const date = calendarDate(formatter, now);
    const today = solarDay(date, coordinates, formatter);
    if (!today) return fallback;
    const midnight = Date.UTC(date.year, date.month - 1, date.day);
    // At high latitudes daylight can cross civil midnight. Include yesterday's
    // sunset and tomorrow's sunrise instead of cutting light off at the date edge.
    const cycles = [
      solarDay(dateAt(midnight - DAY), coordinates, formatter), today,
      solarDay(dateAt(midnight + DAY), coordinates, formatter),
    ];
    let daylight = today.kind === "polar-day";
    let nextTransition = Infinity;
    for (const cycle of cycles) {
      if (cycle?.kind !== "normal") continue;
      if (cycle.sunrise <= now && now < cycle.sunset) daylight = true;
      for (const boundary of [cycle.sunrise, cycle.sunset]) {
        if (boundary > now) nextTransition = Math.min(nextTransition, boundary);
      }
    }
    const effective = daylight ? "light" : "dark";
    return Number.isFinite(nextTransition) ? { effective, nextTransition } : { effective };
  } catch {
    // Intl, clock and solar failures must not prevent the shell from rendering.
    return fallback;
  }
}
