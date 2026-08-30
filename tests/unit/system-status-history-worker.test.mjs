import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import worker, {
  SYSTEM_STATUS_HISTORY_DEADLINE_MS,
  SYSTEM_STATUS_HISTORY_RESPONSE_MAX_BYTES,
  normalizeBetterStackAvailability,
} from "../../workers/huihui-api/worker.js";

const route = "/api/system-status/history";
const endpoint = `https://api.example.test${route}`;
const upstreamUrl = "https://status.example.test/index.json";
const configuredEnv = { BETTER_STACK_STATUS_PAGE_JSON_URL: upstreamUrl };
const definitions = [
  ["website", "Website"],
  ["api", "API"],
  ["contact", "Contact Service"],
];
const now = "2026-08-30T12:34:56.000Z";
const privateMarker = "private-upstream-body-token-marker";

function day(dayValue = "2026-08-30", overrides = {}) {
  return {
    day: dayValue,
    status: "operational",
    downtime_duration: 0,
    maintenance_duration: 0,
    ...overrides,
  };
}

// Better Stack pads its fixed 90-day window before a new monitor's first observation.
function paddedHistory(lastDay = day()) {
  return [
    ...Array.from({ length: 89 }, (_, index) =>
      day(new Date(Date.UTC(2026, 5, 2 + index)).toISOString().slice(0, 10), { status: "not_monitored" })),
    lastDay,
  ];
}

function resource(publicName, overrides = {}) {
  return {
    id: `internal-resource-${publicName}`,
    type: "status_page_resource",
    attributes: {
      resource_id: "internal-monitor-id",
      resource_type: "Monitor",
      public_name: publicName,
      availability: 0.99963,
      status: "operational",
      status_history: [day()],
      explanation: privateMarker,
      ...overrides,
    },
  };
}

function fixture() {
  return {
    data: {
      id: "internal-page-id",
      type: "status_page",
      attributes: { updated_at: "2026-08-01T00:00:00.000Z" },
    },
    included: definitions.map(([, name]) => resource(name)),
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
}

function unknown(id) {
  return {
    id,
    status: "unknown",
    availabilityPercent: null,
    observedDays: 0,
    historyStartDate: null,
    historyEndDate: null,
    history: [],
  };
}

function completeComponent(id) {
  return {
    id,
    status: "operational",
    availabilityPercent: 99.963,
    observedDays: 1,
    historyStartDate: "2026-08-30",
    historyEndDate: "2026-08-30",
    history: [{ date: "2026-08-30", status: "operational", downtimeSeconds: 0, maintenanceSeconds: 0 }],
  };
}

async function requestHistory({
  payload = fixture(),
  fetchMock = vi.fn(async () => jsonResponse(payload)),
  env = configuredEnv,
  method = "GET",
  headers,
  url = endpoint,
  cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
} = {}) {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("caches", { default: cache });
  const pendingTasks = [];
  const response = await worker.fetch(new Request(url, { method, headers }), env, {
    waitUntil(task) { pendingTasks.push(task); },
  });
  await Promise.all(pendingTasks);
  return { response, cache, fetchMock };
}

function expectUncached(response, cache) {
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Cache")).toBe("BYPASS");
  expect(cache.put).not.toHaveBeenCalled();
}

function expectAllUnknown(data) {
  expect(data).toEqual({
    ok: false, source: "better_stack", complete: false, windowDays: 90,
    components: definitions.map(([id]) => unknown(id)),
    fetchedAt: expect.any(String),
  });
  expect(new Date(data.fetchedAt).toISOString()).toBe(data.fetchedAt);
}

let warnSpy;
let errorSpy;
beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Better Stack public System Status history", () => {
  test.each(["vars", "env.beta.vars"])("configures the public non-secret URL in [%s]", (section) => {
    const config = readFileSync(new URL("../../workers/huihui-api/wrangler.toml", import.meta.url), "utf8");
    const vars = config.split(`[${section}]`)[1]?.split("[")[0];
    expect(vars).toMatch(/^BETTER_STACK_STATUS_PAGE_JSON_URL = "https:\/\/huihui-dev\.betteruptime\.com\/index\.json"$/m);
  });

  test("GET normalizes all three resources, ignores unrelated records, and caches only public fields", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const payload = fixture();
    payload.included.reverse();
    payload.included.push(
      resource("Unrelated", { status: "unexpected", status_history: null }),
      { type: "status_report", attributes: { public_name: "Website", message: privateMarker } },
      null,
    );
    const { response, cache, fetchMock } = await requestHistory({ payload });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(data).toEqual({
      ok: true, source: "better_stack", complete: true, windowDays: 90,
      components: definitions.map(([id]) => completeComponent(id)), fetchedAt: now,
    });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(response.headers.get("X-Cache")).toBe("MISS");
    expect(cache.put).toHaveBeenCalledOnce();
    expect(await cache.put.mock.calls[0][1].json()).toEqual(data);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]).toEqual([upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "huihui.dev system-status-history worker" },
      redirect: "manual", cache: "no-store", signal: expect.any(AbortSignal),
    }]);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    for (const marker of [privateMarker, upstreamUrl, "internal-", "updated_at", "checkedAt"]) {
      expect(JSON.stringify(data)).not.toContain(marker);
    }
  });

  test.each(definitions)("isolates a missing %s resource", async (id, name) => {
    const payload = fixture();
    payload.included = payload.included.filter((item) => item.attributes.public_name !== name);
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components).toEqual(definitions.map(([componentId]) =>
      componentId === id ? unknown(id) : completeComponent(componentId)));
    expect(data.ok).toBe(false);
    expect(data.complete).toBe(false);
    expectUncached(response, cache);
  });

  test.each([
    ["duplicate name", (payload) => payload.included.push(resource("Website"))],
    ["duplicate with invalid resource type", (payload) => payload.included.push(resource("Website", { resource_type: "Heartbeat" }))],
    ["invalid resource type", (payload) => { payload.included[0].attributes.resource_type = "Heartbeat"; }],
    ["invalid JSON:API resource type", (payload) => { payload.included[0].type = "monitor"; }],
    ["non-exact public name", (payload) => { payload.included[0].attributes.public_name = "website"; }],
    ["missing attributes", (payload) => { delete payload.included[0].attributes; }],
  ])("fails closed only for the affected component: %s", async (_label, mutate) => {
    const payload = fixture();
    mutate(payload);
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components).toEqual([unknown("website"), completeComponent("api"), completeComponent("contact")]);
    expect(data.complete).toBe(false);
    expect(data.ok).toBe(false);
    expectUncached(response, cache);
    expect(warnSpy.mock.calls).toEqual([[{
      event: "worker_upstream_failure", route, upstream: "better_stack_status_page", category: "invalid_response",
    }]]);
  });

  test.each([
    ["operational", "operational"], ["degraded", "degraded_performance"],
    ["downtime", "major_outage"], ["maintenance", "unknown"],
  ])("maps current and historical %s to %s without discarding durations", async (source, target) => {
    const payload = fixture();
    Object.assign(payload.included[0].attributes, {
      status: source,
      status_history: [day("2026-08-30", { status: source, downtime_duration: 120.5, maintenance_duration: 60.25 })],
    });
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components[0]).toMatchObject({
      status: target, availabilityPercent: 99.963, observedDays: 1,
      history: [{ date: "2026-08-30", status: target, downtimeSeconds: 120.5, maintenanceSeconds: 60.25 }],
    });
    expect(data.complete).toBe(target !== "unknown");
    expect(data.ok).toBe(target !== "unknown");
    if (target === "unknown") expectUncached(response, cache);
    else expect(cache.put).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(data)).not.toContain("under_maintenance");
  });

  test.each(["unexpected", "under_maintenance", "constructor", null, 1, ["operational"]].map((status) => [status]))(
    "rejects unexpected current state %j", async (status) => {
      const payload = fixture();
      payload.included[0].attributes.status = status;
      const { response, cache } = await requestHistory({ payload });
      const data = await response.json();
      expect(data.components[0]).toEqual(unknown("website"));
      expect(data.components[1]).toEqual(completeComponent("api"));
      expectUncached(response, cache);
    },
  );

  test.each([[0, 0], [0.5, 50], [0.99963, 99.963], [1.0, 100], [99.95, 99.95], [100, 100]])(
    "normalizes availability %s to %s, rounding only at serialization", async (availability, expected) => {
      expect(normalizeBetterStackAvailability(availability)).toBe(availability <= 1 ? availability * 100 : availability);
      const payload = fixture();
      payload.included[0].attributes.availability = availability;
      const { response } = await requestHistory({ payload });
      expect((await response.json()).components[0].availabilityPercent).toBe(expected);
    },
  );

  test.each([-1, NaN, Infinity, -Infinity, "99.95", null, undefined, true, {}, 100.001])(
    "never fabricates green availability for %j", async (availability) => {
      expect(normalizeBetterStackAvailability(availability)).toBeNull();
      const payload = fixture();
      payload.included[0].attributes.availability = availability;
      const { response, cache } = await requestHistory({ payload });
      const data = await response.json();
      expect(data.components[0]).toEqual(unknown("website"));
      expect(data.components[1]).toEqual(completeComponent("api"));
      expect(data.ok).toBe(false);
      expectUncached(response, cache);
    },
  );

  test("retains meaningful internal precision and rounds only public availability", async () => {
    const availability = 0.987654321234;
    expect(normalizeBetterStackAvailability(availability)).toBe(availability * 100);
    const payload = fixture();
    payload.included[0].attributes.availability = availability;
    const { response } = await requestHistory({ payload });
    expect((await response.json()).components[0].availabilityPercent).toBe(98.76543212);
  });

  test("accepts empty history without fabricating coverage", async () => {
    const payload = fixture();
    payload.included[0].attributes.status_history = [];
    const { response } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components[0]).toEqual({
      ...completeComponent("website"), observedDays: 0, historyStartDate: null, historyEndDate: null, history: [],
    });
    expect(data.windowDays).toBe(90);
    expect(data.complete).toBe(true); // Schema completeness is not 90-day coverage.
  });

  test.each([
    ["operational", "operational", 0, 0],
    ["downtime", "major_outage", 2785.414413725, 60.25],
  ])("omits 89 leading unobserved days and retains the one %s observation", async (source, target, downtime, maintenance) => {
    const payload = fixture();
    payload.included[0].attributes.status_history = paddedHistory(day(undefined, {
      status: source, downtime_duration: downtime, maintenance_duration: maintenance,
    }));
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components[0]).toEqual({
      ...completeComponent("website"),
      history: [{ date: "2026-08-30", status: target, downtimeSeconds: downtime, maintenanceSeconds: maintenance }],
    });
    expect(data.complete).toBe(true);
    expect(data.ok).toBe(true);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(response.headers.get("X-Cache")).toBe("MISS");
    expect(cache.put).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("preserves current not_monitored as Unknown while retaining real downtime history", async () => {
    const payload = fixture();
    for (const item of payload.included) item.attributes.status_history = paddedHistory();
    for (const item of payload.included.slice(1)) {
      item.attributes.status = "not_monitored";
      item.attributes.status_history = paddedHistory(day(undefined, { status: "downtime", downtime_duration: 2785.414413725 }));
    }
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components).toEqual([
      completeComponent("website"),
      ...["api", "contact"].map((id) => ({
        ...completeComponent(id), status: "unknown",
        history: [{ date: "2026-08-30", status: "major_outage", downtimeSeconds: 2785.414413725, maintenanceSeconds: 0 }],
      })),
    ]);
    expect(data.complete).toBe(false);
    expect(data.ok).toBe(false);
    expectUncached(response, cache);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("omits a paused day between non-contiguous observations without filling any gap", async () => {
    const payload = fixture();
    payload.included[0].attributes.status_history = [
      day("2026-08-30"), day("2026-08-27", { status: "not_monitored", downtime_duration: 25, maintenance_duration: 10 }), day("2026-08-25"),
    ];
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components[0]).toEqual({
      ...completeComponent("website"), observedDays: 2, historyStartDate: "2026-08-25",
      history: ["2026-08-25", "2026-08-30"].map((date) => ({
        date, status: "operational", downtimeSeconds: 0, maintenanceSeconds: 0,
      })),
    });
    expect(data.complete).toBe(true);
    expect(cache.put).toHaveBeenCalledOnce();
  });

  test.each(["operational", "not_monitored"])("all 90 unobserved days give no coverage while current %s controls completeness", async (status) => {
    const payload = fixture();
    Object.assign(payload.included[0].attributes, {
      status, status_history: paddedHistory(day(undefined, { status: "not_monitored" })),
    });
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components[0]).toEqual({
      ...unknown("website"), status: status === "operational" ? "operational" : "unknown", availabilityPercent: 99.963,
    });
    expect(data.complete).toBe(status === "operational");
    expect(data.ok).toBe(status === "operational");
    if (status === "operational") expect(cache.put).toHaveBeenCalledOnce();
    else expectUncached(response, cache);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test.each([
    ["unshaped date", { day: "2026-6-02" }], ["impossible date", { day: "2026-02-30" }],
    ["missing date", { day: undefined }], ["invalid month", { day: "2026-13-01" }],
    ["negative downtime", { downtime_duration: -1 }], ["string downtime", { downtime_duration: "0" }],
    ["missing downtime", { downtime_duration: undefined }], ["NaN downtime", { downtime_duration: NaN }],
    ["infinite downtime", { downtime_duration: Infinity }],
    ["negative maintenance", { maintenance_duration: -1 }], ["string maintenance", { maintenance_duration: "0" }],
    ["missing maintenance", { maintenance_duration: undefined }], ["infinite maintenance", { maintenance_duration: Infinity }],
  ])("validates unobserved records before filtering: %s", async (_label, overrides) => {
    const payload = fixture();
    payload.included[0].attributes.status_history = paddedHistory();
    Object.assign(payload.included[0].attributes.status_history[0], overrides);
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components).toEqual([unknown("website"), completeComponent("api"), completeComponent("contact")]);
    expect(data.complete).toBe(false);
    expectUncached(response, cache);
    expect(warnSpy).toHaveBeenCalledWith({ event: "worker_upstream_failure", route, upstream: "better_stack_status_page", category: "invalid_response" });
  });

  test.each([
    ["not_monitored", "not_monitored"], ["not_monitored", "operational"], ["operational", "not_monitored"],
  ])("rejects duplicate dates across %s and %s before filtering", async (first, second) => {
    const payload = fixture();
    payload.included[0].attributes.status_history = [day(undefined, { status: first }), day(undefined, { status: second })];
    const { response, cache } = await requestHistory({ payload });
    expect((await response.json()).components[0]).toEqual(unknown("website"));
    expectUncached(response, cache);
  });

  test("sorts four non-contiguous real days and never fills their gaps", async () => {
    const payload = fixture();
    payload.included[0].attributes.status_history = ["2026-08-30", "2026-08-19", "2026-08-28", "2026-08-20"].map((value) => day(value));
    const { response } = await requestHistory({ payload });
    expect((await response.json()).components[0]).toMatchObject({
      observedDays: 4, historyStartDate: "2026-08-19", historyEndDate: "2026-08-30",
      history: ["2026-08-19", "2026-08-20", "2026-08-28", "2026-08-30"].map((date) => ({
        date, status: "operational", downtimeSeconds: 0, maintenanceSeconds: 0,
      })),
    });
  });

  test("caps sorted output to the latest 90 returned days", async () => {
    const payload = fixture();
    const days = Array.from({ length: 95 }, (_, index) =>
      day(new Date(Date.UTC(2026, 4, 28 + index)).toISOString().slice(0, 10)));
    payload.included[0].attributes.status_history = [...days].reverse();
    const { response } = await requestHistory({ payload });
    const component = (await response.json()).components[0];
    expect(component.observedDays).toBe(90);
    expect(component.history.map((item) => item.date)).toEqual(days.slice(-90).map((item) => item.day));
    expect(component.historyStartDate).toBe(days[5].day);
    expect(component.historyEndDate).toBe(days[94].day);
  });

  test("rejects duplicate history even when the duplicated day would be outside the output cap", async () => {
    const payload = fixture();
    const days = Array.from({ length: 95 }, (_, index) =>
      day(new Date(Date.UTC(2026, 4, 28 + index)).toISOString().slice(0, 10)));
    payload.included[0].attributes.status_history = [days[0], ...days];
    const { response, cache } = await requestHistory({ payload });
    expect((await response.json()).components[0]).toEqual(unknown("website"));
    expectUncached(response, cache);
  });

  test.each([
    ["missing history", undefined], ["non-array history", {}], ["null record", [null]],
    ["duplicate day", [day(), day()]],
    ["unshaped day", [day("2026-8-30")]], ["impossible day", [day("2026-02-30")]],
    ["invalid month", [day("2026-13-01")]], ["timestamp instead of day", [day(now)]],
    ["unknown historical state", [day(undefined, { status: "surprise" })]],
    ["negative downtime", [day(undefined, { downtime_duration: -1 })]],
    ["string downtime", [day(undefined, { downtime_duration: "0" })]],
    ["missing downtime", [day(undefined, { downtime_duration: undefined })]],
    ["NaN downtime", [day(undefined, { downtime_duration: NaN })]],
    ["infinite downtime", [day(undefined, { downtime_duration: Infinity })]],
    ["negative maintenance", [day(undefined, { maintenance_duration: -1 })]],
    ["missing maintenance", [day(undefined, { maintenance_duration: undefined })]],
    ["string maintenance", [day(undefined, { maintenance_duration: "0" })]],
    ["infinite maintenance", [day(undefined, { maintenance_duration: Infinity })]],
  ])("isolates malformed history: %s", async (_label, history) => {
    const payload = fixture();
    payload.included[0].attributes.status_history = history;
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components).toEqual([unknown("website"), completeComponent("api"), completeComponent("contact")]);
    expect(data.complete).toBe(false);
    expectUncached(response, cache);
  });

  test("historical maintenance is retained and prevents caching even when currently operational", async () => {
    const payload = fixture();
    payload.included[0].attributes.status_history = [day(undefined, { status: "maintenance", maintenance_duration: 600 })];
    const { response, cache } = await requestHistory({ payload });
    const data = await response.json();
    expect(data.components[0].status).toBe("operational");
    expect(data.components[0].history[0]).toMatchObject({ status: "unknown", maintenanceSeconds: 600 });
    expect(data.complete).toBe(false);
    expectUncached(response, cache);
  });

  test.each([null, [], {}, { data: { type: "monitor" }, included: [] }, { data: { type: "status_page" }, included: {} }])(
    "fails closed for invalid top-level JSON:API schema %j", async (payload) => {
      const { response, cache } = await requestHistory({ payload });
      expectAllUnknown(await response.json());
      expectUncached(response, cache);
      expect(warnSpy).toHaveBeenCalledWith({ event: "worker_upstream_failure", route, upstream: "better_stack_status_page", category: "invalid_response" });
    },
  );

  test.each([301, 302, 400, 401, 404, 500, 503])("fails closed for HTTP %s without following redirects", async (status) => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const fetchMock = vi.fn(async () => new Response(body, { status, headers: { Location: "https://untrusted.example.test/" } }));
    const { response, cache } = await requestHistory({ fetchMock });
    expectAllUnknown(await response.json());
    expectUncached(response, cache);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls).toEqual([[{ event: "worker_upstream_failure", route, upstream: "better_stack_status_page", category: "http_status", httpStatus: status }]]);
  });

  test.each([
    ["malformed JSON", () => new Response(`{${privateMarker}`), "parse"],
    ["network error", () => { throw new Error(`${privateMarker} ${upstreamUrl}`); }, "network"],
    ["declared oversized body", () => new Response("{}", { headers: { "Content-Length": String(SYSTEM_STATUS_HISTORY_RESPONSE_MAX_BYTES + 1) } }), "size_limit"],
    ["streamed oversized body", () => new Response("x".repeat(SYSTEM_STATUS_HISTORY_RESPONSE_MAX_BYTES + 1)), "size_limit"],
    ["lying Content-Length", () => new Response("x".repeat(SYSTEM_STATUS_HISTORY_RESPONSE_MAX_BYTES + 1), { headers: { "Content-Length": "2" } }), "size_limit"],
  ])("fails closed with bounded diagnostics for %s", async (_label, upstream, category) => {
    const { response, cache } = await requestHistory({ fetchMock: vi.fn(async () => upstream()) });
    expectAllUnknown(await response.json());
    expectUncached(response, cache);
    expect(warnSpy.mock.calls).toEqual([[{ event: "worker_upstream_failure", route, upstream: "better_stack_status_page", category }]]);
  });

  test("accepts a valid response exactly at the byte limit", async () => {
    const payload = fixture();
    payload.padding = "";
    const initialBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    payload.padding = "x".repeat(SYSTEM_STATUS_HISTORY_RESPONSE_MAX_BYTES - initialBytes);
    const { response, cache } = await requestHistory({ payload });
    expect((await response.json()).complete).toBe(true);
    expect(cache.put).toHaveBeenCalledOnce();
  });

  test.each(["headers", "body"])("bounds stalled %s with the shared deadline and abort signal", async (stage) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    let signal;
    const fetchMock = vi.fn(async (_url, init) => {
      signal = init.signal;
      if (stage === "headers") return new Promise(() => {});
      return new Response(new ReadableStream({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(new Error(privateMarker)), { once: true });
        },
      }));
    });
    const pending = requestHistory({ fetchMock });
    await vi.advanceTimersByTimeAsync(SYSTEM_STATUS_HISTORY_DEADLINE_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const { response, cache } = await pending;
    const data = await response.json();
    expectAllUnknown(data);
    expect(data.fetchedAt).toBe("2026-08-30T12:35:00.000Z");
    expect(signal.aborted).toBe(true);
    expectUncached(response, cache);
    expect(warnSpy.mock.calls).toEqual([[{ event: "worker_upstream_failure", route, upstream: "better_stack_status_page", category: "timeout" }]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each([undefined, "", "   ", 123])("fails closed before cache/fetch for missing configuration %j", async (value) => {
    const { response, cache, fetchMock } = await requestHistory({ env: { BETTER_STACK_STATUS_PAGE_JSON_URL: value } });
    expectAllUnknown(await response.json());
    expectUncached(response, cache);
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls).toEqual([[{ event: "worker_configuration_failure", route, upstream: "better_stack_status_page", category: "missing_config" }]]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test.each([
    "not-a-url", "http://status.example.test/index.json", "/index.json",
    "https://user@status.example.test/index.json", "https://user:password@status.example.test/index.json",
    "https://status.example.test/index.json#fragment", "https://status.example.test/index.json?token=private",
    "https://status.example.test/", "https://status.example.test/index.json/", "https://status.example.test/other.json",
  ])("rejects malformed configured URL %s before cache/fetch", async (value) => {
    const { response, cache, fetchMock } = await requestHistory({ env: { BETTER_STACK_STATUS_PAGE_JSON_URL: value } });
    expectAllUnknown(await response.json());
    expectUncached(response, cache);
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls).toEqual([[{ event: "worker_upstream_failure", route, upstream: "better_stack_status_page", category: "invalid_response" }]]);
  });

  test("ignores request-controlled upstream URLs and headers, including with no configuration", async () => {
    const url = `${endpoint}?url=https://evil.example.test/index.json&token=${privateMarker}`;
    const headers = { Authorization: `Bearer ${privateMarker}`, Cookie: privateMarker, "User-Agent": privateMarker, "CF-Connecting-IP": "192.0.2.42" };
    const first = await requestHistory({ url, headers });
    expect(first.fetchMock.mock.calls[0][0]).toBe(upstreamUrl);
    const init = first.fetchMock.mock.calls[0][1];
    expect(init.headers).toEqual({ Accept: "application/json", "User-Agent": "huihui.dev system-status-history worker" });
    expect(new Headers(init.headers).has("Cookie")).toBe(false);
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(first.cache.match.mock.calls[0][0].url).not.toContain(privateMarker);
    const second = await requestHistory({ url, headers, env: {} });
    expectAllUnknown(await second.response.json());
    expect(second.fetchMock).not.toHaveBeenCalled();
    const serialized = JSON.stringify([await first.response.json(), warnSpy.mock.calls, errorSpy.mock.calls]);
    for (const marker of [privateMarker, upstreamUrl, "192.0.2.42", "Bearer", "Error:"]) expect(serialized).not.toContain(marker);
  });

  test("uses a cache HIT, then returns Unknown after cache expiry and upstream failure", async () => {
    let stored;
    let expiresAt = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const cache = {
      match: vi.fn(async () => Date.now() < expiresAt ? stored.clone() : undefined),
      put: vi.fn(async (_key, response) => {
        stored = response;
        expiresAt = Date.now() + 60_000;
      }),
    };
    const first = await requestHistory({ cache });
    const firstData = await first.response.json();
    await vi.advanceTimersByTimeAsync(59_000);
    const hit = await requestHistory({ cache, headers: { Origin: "https://huihui.dev" } });
    expect(hit.response.headers.get("X-Cache")).toBe("HIT");
    expect(hit.response.headers.get("Access-Control-Allow-Origin")).toBe("https://huihui.dev");
    expect(await hit.response.json()).toEqual(firstData);
    expect(hit.fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_001);
    cache.put.mockClear();
    const failure = await requestHistory({ cache, fetchMock: vi.fn(async () => { throw new Error(privateMarker); }) });
    expectAllUnknown(await failure.response.json());
    expectUncached(failure.response, cache);
  });

  test("cache write failures remain bounded without rejecting valid fetched data", async () => {
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => { throw new Error(privateMarker); }),
    };
    const { response } = await requestHistory({ cache });
    expect((await response.json()).complete).toBe(true);
    expect(errorSpy.mock.calls).toEqual([[{
      event: "worker_unhandled_failure", route, upstream: "worker", category: "unhandled",
    }]]);
  });

  test("isolates the cache when the trusted public status-page configuration changes", async () => {
    const stored = new Map();
    const cache = {
      match: vi.fn(async (key) => stored.get(key.url)?.clone()),
      put: vi.fn(async (key, value) => { stored.set(key.url, value); }),
    };
    await requestHistory({ cache });
    const changedUrl = "https://different-status.example.test/index.json";
    const second = await requestHistory({ cache, env: { BETTER_STACK_STATUS_PAGE_JSON_URL: changedUrl } });
    expect(second.response.headers.get("X-Cache")).toBe("MISS");
    expect(second.fetchMock.mock.calls[0][0]).toBe(changedUrl);
  });

  test.each(["GET", "OPTIONS"])("reuses production/beta/Preview CORS rules for %s", async (method) => {
    for (const [environment, origin, allowed] of [
      ["production", "https://huihui.dev", true], ["production", "https://www.huihui.dev", true],
      ["production", "https://beta.huihui.dev", false], ["beta", "https://beta.huihui.dev", true],
      ["beta", "https://huihuidev-beta.pages.dev", true], ["beta", "https://preview.huihuidev-beta.pages.dev", true],
      ["beta", "https://huihui.dev", false], ["beta", "https://huihuidev-beta.pages.dev.evil.test", false],
      ["beta", "http://beta.huihui.dev", false], ["production", "https://evil.example.test", false],
    ]) {
      const { response, cache, fetchMock } = await requestHistory({ method, headers: { Origin: origin }, env: { ...configuredEnv, WORKER_ENV: environment } });
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(allowed ? origin : null);
      expect(response.headers.get("Vary")).toBe("Origin");
      expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(false);
      if (method === "OPTIONS") {
        expect(response.status).toBe(204);
        expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
        expect(response.headers.get("Access-Control-Allow-Methods")).toBe(allowed ? "GET, OPTIONS" : null);
        expect(await response.text()).toBe("");
        expect(cache.match).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
      }
    }
  });

  test.each(["HEAD", "POST", "PUT", "PATCH", "DELETE"])("rejects %s with 405 + Allow before upstream/cache access", async (method) => {
    const { response, cache, fetchMock } = await requestHistory({ method, headers: { Origin: "https://huihui.dev" } });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://huihui.dev");
    expect(await response.json()).toEqual({ ok: false, error: "Method Not Allowed" });
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
