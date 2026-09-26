import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createSystemStatusClient, isSystemStatus, systemStatusValues } from "../../v2/src/services/system-status.ts";
import { resolveApiEndpoint } from "../../v2/src/services/endpoints.ts";
import { createSystemStatus } from "../../v2/src/components/system-status.ts";
import en from "../../v2/src/locales/en.ts";

const payload = () => ({ ok: true, status: "operational", checkedAt: "2026-09-25T09:10:48.104Z",
  components: [{ id: "api", status: "operational" }, { id: "contact", status: "operational" }, { id: "website", status: "operational" }] });
let fetchMock;
beforeEach(() => { vi.useFakeTimers(); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });

test.each(["success", "failure"])("keeps the atomic live region busy through the complete %s render", async (outcome) => {
  const mutations = [];
  const watched = new Set();
  let region;
  // Observe mutations synchronously: a MutationObserver would only see the completed render.
  const record = (target, action) => {
    if (watched.has(target)) mutations.push({ action, busy: region.attributes["aria-busy"] });
  };
  vi.stubGlobal("document", {
    createTextNode: (textContent) => ({ textContent }),
    createElement: () => {
      const node = {
        attributes: {}, children: [],
        setAttribute(name, value) { this.attributes[name] = value; record(this, name); },
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; record(this, "children"); },
      };
      node.dataset = new Proxy({}, { set(target, key, value) {
        target[key] = value; record(node, `data-${key}`); return true;
      } });
      return node;
    },
  });
  const surface = createSystemStatus(en.home, "beta");
  region = surface.node;
  const [summary, services] = region.children;
  const rows = [summary, services.children[1], services.children[3]];
  [region, ...rows].forEach((node) => watched.add(node));
  expect(region.attributes).toMatchObject({ role: "status", "aria-live": "polite", "aria-atomic": "true" });
  let release;
  fetchMock.mockReturnValueOnce(new Promise((resolve, reject) => { release = outcome === "success" ? resolve : reject; }));
  const work = surface.refresh();
  const loading = { busy: region.attributes["aria-busy"], texts: rows.map((row) => row.children[1].textContent), mutations: [...mutations] };
  mutations.length = 0;
  const data = payload(); data.status = "partial_outage"; data.components[2].status = "partial_outage";
  release(outcome === "success" ? Response.json(data) : new TypeError("offline"));
  await work;
  expect(region.dataset.state).toBe(outcome === "success" ? "ready" : "unknown");
  expect(mutations.filter(({ action }) => action === "children")).toHaveLength(3);
  expect(mutations.at(-1)).toEqual({ action: "aria-busy", busy: "false" });
  expect(mutations.slice(0, -1).every(({ busy }) => busy === "true")).toBe(true);
  expect(region.attributes["aria-busy"]).toBe("false");
  expect(rows.map((row) => row.children[1].textContent)).toEqual(
    (outcome === "success" ? ["partial_outage", "partial_outage", "operational"] : Array(3).fill("unknown"))
      .map((status) => en.home.statusLabels[status]));
  expect(loading.busy).toBe("true");
  expect(loading.texts).toEqual(Array(3).fill(en.home.statusLoading));
  expect(loading.mutations.every(({ busy }) => busy === "true")).toBe(true);
  mutations.length = 0;
  fetchMock.mockReturnValueOnce(new Promise(() => {}));
  const next = surface.refresh();
  surface.cancel(); await next;
  expect(region.attributes["aria-busy"]).toBe("true");
  expect(mutations.every(({ busy }) => busy === "true")).toBe(true);
});

test.each(systemStatusValues)("accepts API overall and component status %s, independent of array order", async (status) => {
  const data = payload(); data.status = status; data.components[0].status = status;
  fetchMock.mockResolvedValue(Response.json(data));
  const render = vi.fn();
  await createSystemStatusClient("beta", render).refresh();
  expect(render.mock.calls).toEqual([[{ state: "loading" }], [{ state: "ready", data }]]);
});
test("optional Contact does not become a required visible component", () => {
  const data = payload(); data.components.splice(1, 1);
  expect(isSystemStatus(data)).toBe(true);
});
test.each([
  ["missing Website", (v) => { v.components.pop(); }],
  ["missing API", (v) => { v.components.shift(); }],
  ["duplicate ID", (v) => { v.components[1].id = "api"; }],
  ["unsupported overall", (v) => { v.status = "healthy"; }],
  ["unsupported component", (v) => { v.components[1].status = "maintenance"; }],
  ["unknown ID", (v) => { v.components[1].id = "external"; }],
  ["invalid date", (v) => { v.checkedAt = "2026-02-30T00:00:00.000Z"; }],
  ["missing date", (v) => { delete v.checkedAt; }],
  ["failed domain response", (v) => { v.ok = false; }],
  ["malformed component", (v) => { v.components[0] = null; }],
])("fails closed for %s", async (_name, change) => {
  const data = payload(); change(data); fetchMock.mockResolvedValue(Response.json(data));
  const render = vi.fn(); await createSystemStatusClient("beta", render).refresh();
  expect(render.mock.calls).toEqual([[{ state: "loading" }], [{ state: "unknown" }]]);
});
test.each([null, [], {}, "ok", 7])("rejects malformed payload %j", (data) => expect(isSystemStatus(data)).toBe(false));
test.each(["http", "network", "json"])("fails closed for %s failure", async (kind) => {
  if (kind === "network") fetchMock.mockRejectedValue(new TypeError("offline"));
  else fetchMock.mockResolvedValue(new Response("{", { status: kind === "http" ? 503 : 200 }));
  const render = vi.fn(); await createSystemStatusClient("beta", render).refresh();
  expect(render).toHaveBeenLastCalledWith({ state: "unknown" });
});
test.each(["beta", "production"])("uses the explicit %s environment and fixed GET/no-store contract", async (environment) => {
  fetchMock.mockResolvedValue(Response.json(payload()));
  await createSystemStatusClient(environment, vi.fn()).refresh();
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(resolveApiEndpoint(environment, "/api/system-status"), {
    method: "GET", cache: "no-store", signal: expect.any(AbortSignal), headers: { Accept: "application/json" },
    mode: "cors", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
  });
});
test.each(["fetch", "body"])("deadline includes stalled %s; late success cannot render", async (stage) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  fetchMock.mockReturnValue(stage === "fetch" ? held : Promise.resolve({ ok: true, text: () => held }));
  const render = vi.fn(); const work = createSystemStatusClient("beta", render).refresh();
  await vi.advanceTimersByTimeAsync(6000); await work;
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  expect(render).toHaveBeenLastCalledWith({ state: "unknown" });
  release(stage === "fetch" ? Response.json(payload()) : JSON.stringify(payload()));
  await vi.advanceTimersByTimeAsync(0);
  expect(render).toHaveBeenCalledTimes(2);
});
test("supersedes old success and cancellation without overwriting a newer result", async () => {
  let release; fetchMock.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  const render = vi.fn(); const client = createSystemStatusClient("beta", render);
  const old = client.refresh();
  const latest = payload(); latest.status = "partial_outage"; latest.components[2].status = "partial_outage";
  fetchMock.mockResolvedValueOnce(Response.json(latest));
  await client.refresh(); await old;
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  release(Response.json(payload())); await vi.advanceTimersByTimeAsync(0);
  expect(render.mock.calls).toEqual([[{ state: "loading" }], [{ state: "loading" }], [{ state: "ready", data: latest }]]);
});
test("cancel cleans up and prevents a detached surface update; refresh can resume", async () => {
  fetchMock.mockReturnValueOnce(new Promise(() => {}));
  const render = vi.fn(); const client = createSystemStatusClient("beta", render);
  const work = client.refresh(); client.cancel(); await work;
  expect(render).toHaveBeenCalledExactlyOnceWith({ state: "loading" });
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  fetchMock.mockResolvedValue(Response.json(payload())); await client.refresh();
  expect(render).toHaveBeenLastCalledWith({ state: "ready", data: payload() });
});
