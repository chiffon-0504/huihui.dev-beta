import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveAutoTheme } from "../../v2/src/theme/auto.ts";
import { createThemeController, THEME_STORAGE_KEY } from "../../v2/src/theme/controller.ts";
import * as solar from "../../v2/src/theme/solar.ts";
import * as timezones from "../../v2/src/theme/timezones.ts";

const date = { year: 2026, month: 9, day: 12 };
const controllers = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Auto resolution", () => {
  test("Taipei daylight and night use the local calendar day", () => {
    expect(resolveAutoTheme(Date.parse("2026-09-12T12:00:00+08:00"), "Asia/Taipei").effective).toBe("light");
    expect(resolveAutoTheme(Date.parse("2026-09-12T02:00:00+08:00"), "Asia/Taipei").effective).toBe("dark");
    expect(resolveAutoTheme(Date.parse("2026-09-12T23:00:00+08:00"), "Asia/Taipei").effective).toBe("dark");
  });
  test("sunrise is inclusive and sunset exclusive down to the millisecond", () => {
    const { sunrise, sunset } = solar.calculateSolarTimes(date, timezones.lookupCoordinates("Asia/Taipei"));
    expect(resolveAutoTheme(sunrise - 1, "Asia/Taipei")).toEqual({ effective: "dark", nextTransition: sunrise });
    expect(resolveAutoTheme(sunrise, "Asia/Taipei")).toEqual({ effective: "light", nextTransition: sunset });
    expect(resolveAutoTheme(sunset - 1, "Asia/Taipei")).toEqual({ effective: "light", nextTransition: sunset });
    const result = resolveAutoTheme(sunset, "Asia/Taipei");
    expect(result.effective).toBe("dark");
    expect(result.nextTransition).toBeGreaterThan(sunset);
    expect(result.nextTransition - sunset).toBeLessThan(24 * 60 * 60 * 1000);
  });
  test.each([undefined, "Mars/Olympus", "UTC"])("unsupported %s falls back to Light", (zone) => {
    expect(resolveAutoTheme(Date.now(), zone)).toEqual({ effective: "light" });
  });
  test("invalid clock and failed solar calculation fall back without throwing", () => {
    expect(resolveAutoTheme(NaN, "Asia/Taipei")).toEqual({ effective: "light" });
    vi.spyOn(solar, "calculateSolarTimes").mockImplementation(() => { throw new Error("calculation failed"); });
    expect(resolveAutoTheme(Date.now(), "Asia/Taipei")).toEqual({ effective: "light" });
  });
  test("invalid mapped timezone or coordinates safely fall back", () => {
    vi.spyOn(timezones, "lookupCoordinates").mockReturnValue({ latitude: NaN, longitude: 0 });
    expect(resolveAutoTheme(Date.now(), "Asia/Taipei")).toEqual({ effective: "light" });
    expect(resolveAutoTheme(Date.now(), "Invalid/Timezone")).toEqual({ effective: "light" });
  });
  test.each(["Pacific/Kiritimati", "Pacific/Apia"])("%s matches solar noon across the date line", (zone) => {
    const noon = Date.parse("2026-09-12T12:30:00+14:00");
    expect(resolveAutoTheme(noon, zone).effective).toBe("light");
    expect(resolveAutoTheme(noon + 12 * 60 * 60 * 1000, zone).effective).toBe("dark");
  });
  test("DST change days resolve daylight without assuming a 24-hour civil day", () => {
    for (const now of ["2026-03-08T12:00:00-04:00", "2026-11-01T12:00:00-05:00"]) {
      expect(resolveAutoTheme(Date.parse(now), "America/New_York").effective).toBe("light");
    }
  });
  test("polar day and polar night have deterministic effective themes", () => {
    expect(resolveAutoTheme(Date.parse("2026-06-21T12:00:00Z"), "Arctic/Longyearbyen").effective).toBe("light");
    expect(resolveAutoTheme(Date.parse("2026-12-21T12:00:00Z"), "Arctic/Longyearbyen").effective).toBe("dark");
  });
  test.each([
    ["Atlantic/Reykjavik", "2026-06-21T00:00:00Z"],
    ["America/Nuuk", "2026-06-21T00:00:00-01:00"],
  ])("%s keeps yesterday's daylight until its sunset after midnight", (zone, midnight) => {
    const previous = solar.calculateSolarTimes({ year: 2026, month: 6, day: 20 }, timezones.lookupCoordinates(zone));
    expect(previous.kind).toBe("normal");
    expect(previous.sunset).toBeGreaterThan(Date.parse(midnight));
    expect(resolveAutoTheme(Date.parse(midnight), zone)).toEqual({ effective: "light", nextTransition: previous.sunset });
    expect(resolveAutoTheme(previous.sunset - 1, zone).effective).toBe("light");
    expect(resolveAutoTheme(previous.sunset, zone).effective).toBe("dark");
  });
});

function environment(saved) {
  const values = new Map(saved === undefined ? [] : [[THEME_STORAGE_KEY, saved]]);
  const storage = {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
  };
  const host = Object.assign(new EventTarget(), {
    localStorage: storage,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
  });
  const page = Object.assign(new EventTarget(), { hidden: false, documentElement: { dataset: {} } });
  const create = () => {
    const controller = createThemeController(host, page);
    controllers.push(controller);
    return controller;
  };
  return { host, page, storage, values, create };
}

describe("theme preference and lifecycle", () => {
  test.each([undefined, "invalid"])("%s defaults to Auto without storing its effective theme", (saved) => {
    const env = environment(saved);
    expect(env.create().getState().preference).toBe("auto");
    expect(env.storage.setItem).not.toHaveBeenCalled();
  });
  test.each(["light", "dark", "auto"])("explicit %s persists across controller creation", (mode) => {
    const env = environment();
    const controller = env.create();
    controller.setPreference(mode);
    expect(env.values.get(THEME_STORAGE_KEY)).toBe(mode);
    expect(controller.getState().preference).toBe(mode);
    if (mode !== "auto") expect(env.page.documentElement.dataset.theme).toBe(mode);
    controller.destroy();
    expect(env.create().getState().preference).toBe(mode);
  });
  test("blocked storage does not break rendering or manual overrides", () => {
    const env = environment();
    Object.defineProperty(env.host, "localStorage", { get() { throw new Error("denied"); } });
    const controller = env.create();
    expect(controller.getState().preference).toBe("auto");
    controller.setPreference("dark");
    expect(controller.getState()).toEqual({ preference: "dark", effective: "dark" });
  });
  test("full storage keeps the manual selection in memory", () => {
    const env = environment();
    env.storage.setItem.mockImplementation(() => { throw new Error("quota"); });
    const controller = env.create();
    controller.setPreference("dark");
    expect(controller.getState()).toEqual({ preference: "dark", effective: "dark" });
  });
  test("Auto crosses both exact transitions and manual override cancels the timer", () => {
    vi.useFakeTimers();
    vi.spyOn(timezones, "resolveTimeZone").mockReturnValue("Asia/Taipei");
    const { sunrise, sunset } = solar.calculateSolarTimes(date, timezones.lookupCoordinates("Asia/Taipei"));
    vi.setSystemTime(sunrise - 1);
    const env = environment();
    const controller = env.create();
    const listener = vi.fn();
    controller.subscribe(listener);
    expect(listener).toHaveBeenLastCalledWith({ preference: "auto", effective: "dark" });
    vi.advanceTimersByTime(1);
    expect(controller.getState()).toEqual({ preference: "auto", effective: "light" });
    vi.advanceTimersByTime(sunset - sunrise);
    expect(controller.getState()).toEqual({ preference: "auto", effective: "dark" });
    expect(env.storage.setItem).not.toHaveBeenCalled();
    controller.setPreference("light");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(controller.getState()).toEqual({ preference: "light", effective: "light" });
  });
  test("suspension, focus, pageshow and clock/timezone changes trigger fresh evaluation", () => {
    vi.useFakeTimers();
    const zone = vi.spyOn(timezones, "resolveTimeZone").mockReturnValue("Asia/Taipei");
    vi.setSystemTime(Date.parse("2026-09-12T12:00:00+08:00"));
    const env = environment();
    const controller = env.create();
    env.page.hidden = true;
    env.page.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(Date.parse("2026-09-14T23:00:00+08:00"));
    env.page.hidden = false;
    env.page.dispatchEvent(new Event("visibilitychange"));
    expect(controller.getState().effective).toBe("dark");
    zone.mockReturnValue("America/New_York");
    env.host.dispatchEvent(new Event("focus"));
    expect(controller.getState().effective).toBe("light");
    zone.mockReturnValue("Asia/Taipei");
    env.host.dispatchEvent(new Event("pageshow"));
    expect(controller.getState().effective).toBe("dark");
    vi.setSystemTime(Date.parse("2026-09-15T12:00:00+08:00"));
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(controller.getState().effective).toBe("light");
    expect(vi.getTimerCount()).toBe(1);
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  test("cross-tab localStorage changes and clearing restore the selected mode", () => {
    const env = environment("dark");
    const controller = env.create();
    env.values.set(THEME_STORAGE_KEY, "light");
    env.host.dispatchEvent(Object.assign(new Event("storage"), { key: THEME_STORAGE_KEY, storageArea: env.storage }));
    expect(controller.getState()).toEqual({ preference: "light", effective: "light" });
    env.values.clear();
    env.host.dispatchEvent(Object.assign(new Event("storage"), { key: null, storageArea: env.storage }));
    expect(controller.getState().preference).toBe("auto");
  });
});
