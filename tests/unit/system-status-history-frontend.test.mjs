import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { systemStatusHistoryFixture } from "../support/system-status.mjs";

function context(locale = "en") {
  const result = vm.createContext({ window: {}, getCurrentLocale: () => locale });
  for (const file of [`js/locales/${locale}.js`, "js/home-cards.js"]) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"), result);
  }
  return result;
}

function validate(payload, mutation = "") {
  const scope = context();
  scope.serialized = JSON.stringify(payload);
  return vm.runInContext(`const data = JSON.parse(serialized); ${mutation}; getValidSystemStatusHistory(data)`, scope);
}

const record = (date, status = "operational") => ({ date, status, downtimeSeconds: 0, maintenanceSeconds: 0 });

describe("frontend history contract", () => {
  test("accepts complete, incomplete, empty and gapped observations without padding", () => {
    for (const records of [[], [record("2026-08-30")], [record("2024-02-29"), record("2026-08-30", "unknown")]]) {
      for (const ok of [true, false]) {
        for (const complete of [true, false]) {
          const data = systemStatusHistoryFixture(records);
          Object.assign(data, { ok, complete });
          const result = validate(data);
          expect(result.complete).toBe(complete);
          expect(result.components[0].history).toEqual(records);
        }
      }
    }
  });

  test.each([
    ["array", "Object.setPrototypeOf(data, Array.prototype)"],
    ["nonplain object", "Object.setPrototypeOf(data, { inherited: true })"],
    ["source", "data.source = 'other'"],
    ["ok", "data.ok = 0"],
    ["complete", "data.complete = null"],
    ["window", "data.windowDays = 89"],
    ["fractional window", "data.windowDays = 90.1"],
    ["timestamp", "data.fetchedAt = 'bad'"],
    ["non-ISO timestamp", "data.fetchedAt = 'August 30, 2026'"],
    ["invalid timestamp day", "data.fetchedAt = '2026-02-30T12:00:00Z'"],
    ["missing component", "data.components.pop()"],
    ["duplicate component", "data.components[2].id = 'api'"],
    ["unexpected component", "data.components[2].id = 'other'"],
    ["null component", "data.components[2] = null"],
    ["noncanonical current status", "data.components[0].status = 'recovered'"],
    ["availability below zero", "data.components[0].availabilityPercent = -1"],
    ["availability above 100", "data.components[0].availabilityPercent = 101"],
    ["availability NaN", "data.components[0].availabilityPercent = NaN"],
    ["availability string", "data.components[0].availabilityPercent = '100'"],
    ["fractional observed days", "data.components[0].observedDays = 1.5"],
    ["negative observed days", "data.components[0].observedDays = -1"],
    ["length mismatch", "data.components[0].observedDays = 0"],
    ["nonarray history", "data.components[0].history = {}"],
    ["null record", "data.components[0].history[0] = null"],
    ["invalid calendar day", "data.components[0].history[0].date = '2026-02-29'"],
    ["overflowing calendar day", "data.components[0].history[0].date = '2026-08-32'"],
    ["noncanonical date", "data.components[0].history[0].date = '2026-8-30'"],
    ["noncanonical daily status", "data.components[0].history[0].status = 'recovered'"],
    ["negative downtime", "data.components[0].history[0].downtimeSeconds = -1"],
    ["NaN downtime", "data.components[0].history[0].downtimeSeconds = NaN"],
    ["infinite downtime", "data.components[0].history[0].downtimeSeconds = Infinity"],
    ["null downtime", "data.components[0].history[0].downtimeSeconds = null"],
    ["negative maintenance", "data.components[0].history[0].maintenanceSeconds = -1"],
    ["NaN maintenance", "data.components[0].history[0].maintenanceSeconds = NaN"],
    ["infinite maintenance", "data.components[0].history[0].maintenanceSeconds = Infinity"],
    ["wrong start", "data.components[0].historyStartDate = '2026-08-29'"],
    ["wrong end", "data.components[0].historyEndDate = null"],
  ])("rejects %s", (_, mutation) => {
    expect(validate(systemStatusHistoryFixture(), mutation)).toBeNull();
  });

  test("rejects duplicate/nonascending dates and more than 90 records", () => {
    for (const records of [
      [record("2026-08-30"), record("2026-08-30")],
      [record("2026-08-30"), record("2026-08-29")],
      Array.from({ length: 91 }, (_, index) => record(new Date(Date.UTC(2026, 4, index + 1)).toISOString().slice(0, 10))),
    ]) expect(validate(systemStatusHistoryFixture(records))).toBeNull();
  });

  test("empty history requires null bounds and allows null availability", () => {
    expect(validate(systemStatusHistoryFixture([]))).not.toBeNull();
    expect(validate(systemStatusHistoryFixture([]), "data.components[0].historyStartDate = '2026-08-30'")).toBeNull();
    expect(validate(systemStatusHistoryFixture([]), "data.components[0].historyEndDate = '2026-08-30'")).toBeNull();
  });

  test("accepts all canonical daily states and strips unsolicited provider fields", () => {
    const states = ["operational", "degraded_performance", "partial_outage", "major_outage", "unknown"];
    const data = systemStatusHistoryFixture(states.map((status, index) => record(`2026-08-${20 + index}`, status)));
    expect(validate(data).components[0].history.map((item) => item.status)).toEqual(states);
    expect(validate(data, "data.components[0].internalId = 'private'").components[0]).not.toHaveProperty("internalId");
  });

  test.each(["zh", "en", "ja"])("%s history copy is complete and duration formatting is human-readable", (locale) => {
    const scope = context(locale);
    const copy = vm.runInContext(`window.HUIHUI_I18N.${locale}.systemStatus.history`, scope);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(vm.runInContext("window.HUIHUI_I18N.en.systemStatus.history", context())).sort());
    expect(Object.values(copy).every((value) => typeof value === "string" && value.trim())).toBe(true);
    expect(vm.runInContext("formatSystemStatusHistoryDuration(7278)", scope)).not.toMatch(/7278|NaN/);
    expect(vm.runInContext("formatSystemStatusHistoryDuration(0.5)", scope)).toBe(copy.lessThanSecond);
  });

  test("English duration includes nonzero hours, minutes, seconds and days", () => {
    const scope = context();
    expect(vm.runInContext("formatSystemStatusHistoryDuration(7278)", scope)).toBe("2 hr 1 min 18 sec");
    expect(vm.runInContext("formatSystemStatusHistoryDuration(90061)", scope)).toBe("1 day 1 hr 1 min 1 sec");
  });
});
