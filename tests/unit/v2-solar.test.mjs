import { afterEach, describe, expect, test, vi } from "vitest";
import { calculateSolarTimes } from "../../v2/src/theme/solar.ts";
import { lookupCoordinates, resolveTimeZone } from "../../v2/src/theme/timezones.ts";
import { timezoneCoordinates } from "../../v2/src/theme/data/timezone-coordinates.ts";

afterEach(() => vi.restoreAllMocks());

describe("v2 bundled timezone coordinates", () => {
  test("Taipei uses the IANA principal location", () => {
    expect(lookupCoordinates("Asia/Taipei")).toEqual({ latitude: 25.05, longitude: 121.5 });
  });

  test.each([
    ["Asia/Calcutta", "Asia/Kolkata"],
    ["Europe/Kiev", "Europe/Kyiv"],
    ["US/Eastern", "America/New_York"],
  ])("supports the browser compatibility name %s", (alias, target) => {
    expect(lookupCoordinates(alias)).toEqual(lookupCoordinates(target));
    expect(lookupCoordinates(alias)).toBeDefined();
  });

  test("zone.tab locations are preserved when their civil clocks share another zone", () => {
    expect(lookupCoordinates("Atlantic/Reykjavik")).toEqual({ latitude: 64.15, longitude: -21.85 });
    expect(lookupCoordinates("Atlantic/Reykjavik")).not.toEqual(lookupCoordinates("Africa/Abidjan"));
  });

  test.each([
    ["Pacific/Ponape", "Pacific/Pohnpei", "Pacific/Guadalcanal", 6.966667, 158.216667],
    ["Pacific/Truk", "Pacific/Chuuk", "Pacific/Port_Moresby", 7.416667, 151.783333],
    ["Africa/Asmera", "Africa/Asmara", "Africa/Nairobi", 15.333333, 38.883333],
    ["Iceland", "Atlantic/Reykjavik", "Africa/Abidjan", 64.15, -21.85],
  ])("%s retains its geographic location instead of a clock-equivalent target", (alias, location, clockTarget, latitude, longitude) => {
    expect(lookupCoordinates(alias)).toEqual({ latitude, longitude });
    expect(lookupCoordinates(alias)).toEqual(lookupCoordinates(location));
    expect(lookupCoordinates(alias)).not.toEqual(lookupCoordinates(clockTarget));
  });

  test("clock-only aliases without a sourced geographic point use the existing fallback", () => {
    expect(lookupCoordinates("Pacific/Yap")).toBeUndefined();
    expect(lookupCoordinates("Asia/Chungking")).toBeUndefined();
  });

  test.each(["Unknown/Zone", "UTC", "Etc/GMT-8", "", "__proto__", "constructor"])("leaves %s to the caller's fallback", (zone) => {
    expect(lookupCoordinates(zone)).toBeUndefined();
  });

  test("all generated locations are valid and available without an Intl lookup", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("unavailable"); });
    expect(Object.keys(timezoneCoordinates)).toHaveLength(512);
    for (const zone of Object.keys(timezoneCoordinates)) expect(lookupCoordinates(zone), zone).toBeDefined();
  });

  test("invalid table coordinates cannot enter the calculation", () => {
    timezoneCoordinates["Test/Invalid"] = [Number.NaN, 0];
    try {
      expect(lookupCoordinates("Test/Invalid")).toBeUndefined();
    } finally {
      delete timezoneCoordinates["Test/Invalid"];
    }
  });

  test("obtains the timezone locally from Intl", () => {
    const factory = vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Taipei" }),
    });
    expect(resolveTimeZone()).toBe("Asia/Taipei");
    expect(factory).toHaveBeenCalledWith();
  });

  test("missing or throwing Intl resolution is safe", () => {
    const factory = vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({ resolvedOptions: () => ({}) });
    expect(resolveTimeZone()).toBeUndefined();
    factory.mockImplementation(() => { throw new Error("unsupported"); });
    expect(resolveTimeZone()).toBeUndefined();
  });
});

describe("v2 local solar calculation", () => {
  // Independent published reference: Taipei Astronomical Museum's 2026 almanac,
  // printed pp. 53 and 65; see v2/src/theme/data/README.md for source and scope.
  test.each([
    [{ year: 2026, month: 6, day: 21 }, "2026-06-20T21:05:00Z", "2026-06-21T10:47:00Z"],
    [{ year: 2026, month: 12, day: 21 }, "2026-12-20T22:34:00Z", "2026-12-21T09:09:00Z"],
  ])("Taipei %j agrees with the published seasonal reference", (date, sunrise, sunset) => {
    const result = calculateSolarTimes(date, lookupCoordinates("Asia/Taipei"));
    expect(result.kind).toBe("normal");
    expect(Math.abs(result.sunrise - Date.parse(sunrise))).toBeLessThan(3 * 60_000);
    expect(Math.abs(result.sunset - Date.parse(sunset))).toBeLessThan(3 * 60_000);
    expect(result.sunrise).toBeLessThan(result.solarNoon);
    expect(result.solarNoon).toBeLessThan(result.sunset);
    expect(Number.isInteger(result.sunrise)).toBe(true);
    expect(Number.isInteger(result.sunset)).toBe(true);
  });

  test.each([
    [78, 6, "polar-day"], [78, 12, "polar-night"],
    [-78, 6, "polar-night"], [-78, 12, "polar-day"],
    [90, 6, "polar-day"], [90, 12, "polar-night"],
    [-90, 6, "polar-night"], [-90, 12, "polar-day"],
  ])("latitude %s in month %s has %s", (latitude, month, kind) => {
    const result = calculateSolarTimes({ year: 2026, month, day: 21 }, { latitude, longitude: 0 });
    expect(result.kind).toBe(kind);
    expect(Number.isFinite(result.solarNoon)).toBe(true);
    expect(result.sunrise).toBeUndefined();
    expect(result.sunset).toBeUndefined();
  });

  test("leap-day calculations are valid and advance to the next cycle", () => {
    const coordinates = lookupCoordinates("Asia/Taipei");
    const leap = calculateSolarTimes({ year: 2028, month: 2, day: 29 }, coordinates);
    const next = calculateSolarTimes({ year: 2028, month: 3, day: 1 }, coordinates);
    expect(leap.kind).toBe("normal");
    expect(next.sunrise - leap.sunrise).toBeGreaterThan(23 * 3_600_000);
    expect(next.sunrise - leap.sunrise).toBeLessThan(25 * 3_600_000);
  });

  test.each([
    { year: 2026, month: 2, day: 29 }, { year: 2026, month: 4, day: 31 },
    { year: 2026, month: 0, day: 1 }, { year: 2026, month: 13, day: 1 },
    { year: 2026, month: 1, day: 0 }, { year: 2026, month: 1, day: 1.5 },
    { year: NaN, month: 1, day: 1 }, { year: 1899, month: 1, day: 1 },
    { year: 2101, month: 1, day: 1 },
  ])("rejects invalid or unsupported date %j", (date) => {
    expect(calculateSolarTimes(date, lookupCoordinates("Asia/Taipei"))).toBeUndefined();
  });

  test.each([
    { latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 },
    { latitude: -91, longitude: 0 }, { latitude: 0, longitude: Infinity },
    { latitude: 0, longitude: 181 }, { latitude: 0, longitude: -181 },
  ])("rejects invalid coordinates %j", (coordinates) => {
    expect(calculateSolarTimes({ year: 2026, month: 6, day: 21 }, coordinates)).toBeUndefined();
  });

  test.each(["Pacific/Kiritimati", "Pacific/Chatham"])("%s keeps the UTC day carry for the civil-date resolver", (timeZone) => {
    const result = calculateSolarTimes({ year: 2026, month: 6, day: 20 }, lookupCoordinates(timeZone));
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    expect(result.kind).toBe("normal");
    expect(localDate.format(result.solarNoon)).toBe("2026-06-21");
    expect(localDate.format(result.sunrise)).toBe("2026-06-21");
    expect(localDate.format(result.sunset)).toBe("2026-06-21");
    expect(new Date(result.sunrise).getUTCDate()).toBe(20);
    expect(new Date(result.sunset).getUTCDate()).toBe(21);
  });

  test("east-longitude sunrise can precede the input date's UTC midnight", () => {
    const result = calculateSolarTimes({ year: 2026, month: 6, day: 21 }, lookupCoordinates("Asia/Tokyo"));
    expect(new Date(result.sunrise).getUTCDate()).toBe(20);
    expect(new Date(result.sunset).getUTCDate()).toBe(21);
  });
});
