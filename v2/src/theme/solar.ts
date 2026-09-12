export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface SolarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export type SolarTimes =
  | { kind: "normal"; solarNoon: number; sunrise: number; sunset: number }
  | { kind: "polar-day" | "polar-night"; solarNoon: number };

const DAY = 86_400_000;
const MINUTE = 60_000;
const RADIANS = Math.PI / 180;
const HORIZON = Math.cos(90.833 * RADIANS);

/**
 * NOAA's approximate fractional-year solar equations; see data/README.md.
 * The input date labels a geographic solar cycle, not an IANA civil day.
 * Callers match solarNoon to their civil date to handle the international
 * date line. Returned events can fall before/after this date's UTC midnight.
 */
export function calculateSolarTimes(date: SolarDate, coordinates: Coordinates): SolarTimes | undefined {
  const { year, month, day } = date;
  const { latitude, longitude } = coordinates;
  if (
    ![year, month, day].every(Number.isInteger) || year < 1900 || year > 2100 ||
    !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) || Math.abs(longitude) > 180
  ) return undefined;

  const midnight = Date.UTC(year, month - 1, day);
  const normalized = new Date(midnight);
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) {
    return undefined;
  }

  const yearStart = Date.UTC(year, 0, 1);
  const daysInYear = (Date.UTC(year + 1, 0, 1) - yearStart) / DAY;
  const fractionalYear = 2 * Math.PI * ((midnight - yearStart) / DAY) / daysInYear;
  const equationOfTime = 229.18 * (
    0.000075 + 0.001868 * Math.cos(fractionalYear) - 0.032077 * Math.sin(fractionalYear) -
    0.014615 * Math.cos(2 * fractionalYear) - 0.040849 * Math.sin(2 * fractionalYear)
  );
  const declination = 0.006918 - 0.399912 * Math.cos(fractionalYear) + 0.070257 * Math.sin(fractionalYear) -
    0.006758 * Math.cos(2 * fractionalYear) + 0.000907 * Math.sin(2 * fractionalYear) -
    0.002697 * Math.cos(3 * fractionalYear) + 0.00148 * Math.sin(3 * fractionalYear);
  const solarNoon = Math.round(midnight + (720 - 4 * longitude - equationOfTime) * MINUTE);
  const latitudeRadians = latitude * RADIANS;
  const center = Math.sin(latitudeRadians) * Math.sin(declination);
  const amplitude = Math.cos(latitudeRadians) * Math.cos(declination);

  // Compare the full daily altitude range before dividing, including ±90°.
  if (center - amplitude >= HORIZON) return { kind: "polar-day", solarNoon };
  if (center + amplitude <= HORIZON) return { kind: "polar-night", solarNoon };

  const hourAngle = Math.acos((HORIZON - center) / amplitude) / RADIANS;
  const halfDay = 4 * hourAngle * MINUTE;
  const sunrise = Math.round(solarNoon - halfDay);
  const sunset = Math.round(solarNoon + halfDay);
  if (![solarNoon, sunrise, sunset].every(Number.isFinite) || sunrise >= sunset) return undefined;
  return { kind: "normal", solarNoon, sunrise, sunset };
}
