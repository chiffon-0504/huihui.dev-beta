import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { systemStatusFixture, systemStatusHistoryFixture, systemStatusIncidentsFixture, systemStatusIncidentReport } from "../support/system-status.mjs";

// Small DOM double, following the existing frontend VM tests; markup is forbidden.
function element(tagName) {
  return {
    tagName, children: [], dataset: {}, attributes: {}, className: "", text: "",
    classList: { toggle: vi.fn() },
    set innerHTML(_) { throw new Error("Markup is not allowed"); },
    set textContent(value) { this.text = value; this.children = []; },
    get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); },
    get lastElementChild() { return this.children.at(-1); },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.text = ""; this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) { return this.children.find((child) => child.className === selector.slice(1)); },
  };
}

function context(locale = "en") {
  const elements = {};
  for (const [id, prefix] of [["systemStatusIncidents", "incidents"], ["systemStatusHistory", "history"]]) {
    const container = element("section");
    container.append(element("p"), element("div"));
    container.children[0].className = `system-status-${prefix}-message`;
    container.children[1].className = `system-status-${prefix}-content`;
    elements[id] = container;
  }
  const current = element("section");
  current.dataset.systemStatusSurface = "detail";
  const listeners = new Map();
  const scope = vm.createContext({
    window: {
      addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
      removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    },
    document: { createElement: element, createDocumentFragment: () => element("fragment"),
      getElementById: (id) => elements[id], querySelectorAll: () => [current] },
    getCurrentLocale: () => locale, getHuihuiApiBase: () => "https://api.huihui.dev",
    URL, AbortController, setTimeout, clearTimeout, fetch: vi.fn(),
  });
  for (const file of [`js/locales/${locale}.js`, "js/home-cards.js"]) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"), scope);
  }
  const run = (code) => vm.runInContext(code, scope);
  const local = (data) => { scope.serialized = JSON.stringify(data); return run("JSON.parse(serialized)"); };
  const response = (data) => ({ ok: true, json: async () => local(data) });
  return { scope, run, local, response, elements, current, listeners };
}

function validate(mutation = "", payload = systemStatusIncidentsFixture([systemStatusIncidentReport(0, 2), systemStatusIncidentReport(1)])) {
  const { scope, run, local } = context();
  scope.data = local(payload);
  return run(`${mutation}; getValidSystemStatusIncidents(data)`);
}

afterEach(() => vi.useRealTimers());

describe("B3 frontend contract", () => {
  test.each([[], [systemStatusIncidentReport()], [systemStatusIncidentReport(0, 3)],
    [systemStatusIncidentReport(0, 3), systemStatusIncidentReport(1, 2)]].map((reports) => ({ reports })))("preserves valid reports and chronology %#", ({ reports }) => {
    const result = validate("", systemStatusIncidentsFixture(reports));
    expect(result.reports).toEqual(reports.map(({ key, ...report }) => report));
  });

  test("accepts valid empty success and exact maximum bounds", () => {
    expect(validate("", systemStatusIncidentsFixture()).reports).toEqual([]);
    const reports = Array.from({ length: 20 }, (_, i) => systemStatusIncidentReport(i, 20));
    reports[0].title = "a".repeat(200);
    reports[0].updates[0].message = "a".repeat(4000);
    expect(validate("", systemStatusIncidentsFixture(reports)).reports).toHaveLength(20);
  });

  test.each([
    "https://huihui-dev.betteruptime.com", "https://status.huihui.dev",
    "https://another.betteruptime.com", "https://status.example.org",
  ])("accepts same-origin reports from %s without rewriting URLs", (origin) => {
    const reports = [systemStatusIncidentReport(), systemStatusIncidentReport(1)];
    reports[0].url = `${origin}/incident/abc`;
    reports[1].url = `${origin}/incident/${"A0_-".repeat(32)}`;
    expect(validate("", systemStatusIncidentsFixture(reports)).reports)
      .toEqual(reports.map(({ key, ...report }) => report));
  });

  test.each([
    ["https://status.huihui.dev", "https://huihui-dev.betteruptime.com"],
    ["https://huihui-dev.betteruptime.com", "https://status.huihui.dev"],
    ["https://status.huihui.dev", "https://status.example.org"],
    ["https://status.huihui.dev", "https://status.huihui.dev.example.org"],
  ])("rejects mixed origins %s and %s wholesale", (first, second) => {
    const reports = [systemStatusIncidentReport(), systemStatusIncidentReport(1)];
    reports[0].url = `${first}/incident/abc`;
    reports[1].url = `${second}/incident/def`;
    expect(validate("", systemStatusIncidentsFixture(reports))).toBeNull();
  });

  test.each([
    ["null", "data = null"], ["array", "data = []"],
    ["nonplain", "Object.setPrototypeOf(data, { inherited: true })"],
    ["ok false", "data.ok = false"], ["ok missing", "delete data.ok"], ["ok number", "data.ok = 1"],
    ["source", "data.source = 'other'"], ["reports missing", "delete data.reports"],
    ["reports object", "data.reports = {}"], ["21 reports", "data.reports = Array(21).fill(data.reports[0])"],
    ["report null", "data.reports[0] = null"], ["report array", "data.reports[0] = []"],
    ["nonplain report", "Object.setPrototypeOf(data.reports[0], { inherited: true })"],
    ["duplicate key", "data.reports[1].key = data.reports[0].key"],
    ["bad key", "data.reports[0].key = 'A'.repeat(64)"], ["short key", "data.reports[0].key = 'a'"],
    ["key newline", "data.reports[0].key += '\\n'"],
    ["missing key", "delete data.reports[0].key"], ["title number", "data.reports[0].title = 2"],
    ["blank title", "data.reports[0].title = '  '"], ["overlong title", "data.reports[0].title = 'a'.repeat(201)"],
    ["UTF16 title", "data.reports[0].title = '😀'.repeat(101)"],
    ["updates object", "data.reports[0].updates = {}"], ["empty updates", "data.reports[0].updates = []"],
    ["21 updates", "data.reports[0].updates = Array(21).fill(data.reports[0].updates[0])"],
    ["null update", "data.reports[0].updates[0] = null"], ["array update", "data.reports[0].updates[0] = []"],
    ["nonplain update", "Object.setPrototypeOf(data.reports[0].updates[0], { inherited: true })"],
    ["blank message", "data.reports[0].updates[0].message = '\\n '"],
    ["message number", "data.reports[0].updates[0].message = 2"],
    ["overlong message", "data.reports[0].updates[0].message = 'a'.repeat(4001)"],
    ["UTF16 message", "data.reports[0].updates[0].message = '😀'.repeat(2001)"],
    ["duplicate update", "data.reports[0].updates[1] = {...data.reports[0].updates[0]}"],
    ["reversed updates", "data.reports[0].updates.reverse()"], ["reversed reports", "data.reports.reverse()"],
  ])("rejects %s without repairing data", (_, mutation) => expect(validate(mutation)).toBeNull());

  test.each([null, 0, "", "yesterday", "August 30, 2026", "2026-08-30", "2026-02-30T12:00:00.000Z",
    "2026-02-29T12:00:00.000Z", "2026-08-30T24:00:00.000Z", "2026-08-30T12:60:00.000Z",
    "2026-08-30T12:00:60.000Z", "2026-08-30T12:00:00", "2026-08-30T12:00:00.000Z "])("rejects invalid instant %s for either timestamp", (value) => {
    for (const target of ["data.fetchedAt", "data.reports[0].updates[0].publishedAt"]) {
      expect(validate(`${target} = ${JSON.stringify(value)}`)).toBeNull();
    }
  });

  test.each([null, 2, "javascript:alert(1)", "http://huihui-dev.betteruptime.com/incident/abc",
    ...["?x=1", "?", "#x", "#", "/", "/extra", "%2f", "."].map((suffix) => `https://huihui-dev.betteruptime.com/incident/abc${suffix}`),
    "https://user:pass@huihui-dev.betteruptime.com/incident/abc", "https://@huihui-dev.betteruptime.com/incident/abc",
    "https://huihui-dev.betteruptime.com:443/incident/abc", "https://huihui-dev.betteruptime.com/other/../incident/abc",
    "https://huihui-dev.betteruptime.com/incident/", "https://huihui-dev.betteruptime.com/incident/" + "a".repeat(129),
    " https://huihui-dev.betteruptime.com/incident/abc", "https://huihui-dev.betteruptime.com\\incident\\abc",
    "https://huihui-dev.betteruptime.com/incident/abc\n",
    "HTTPS://status.huihui.dev/incident/abc", "https://STATUS.huihui.dev/incident/abc",
    "https://%73tatus.huihui.dev/incident/abc", "https://status.huihui.dev:/incident/abc",
    "https://status.huihui.dev:443/incident/abc", "https://status.huihui.dev:8443/incident/abc",
    "https://status.huihui.dev/incident/../incident/abc", "https://status.huihui.dev/%2e%2e/incident/abc",
    "https://status.huihui.dev/incident/%61bc", "https://status.huihui.dev/incident/a%5cb",
    "https://status.huihui.dev//incident/abc", "https://status.huihui.dev/incident/a b",
    "https://status.huihui.dev/incident/a.b", "https://status.huihui.dev/incident/abc ",
    "https://sta\ttus.huihui.dev/incident/abc", "https:////status.huihui.dev/incident/abc",
  ])("rejects unsafe URL %s", (url) => expect(validate("",
    systemStatusIncidentsFixture([{ ...systemStatusIncidentReport(), url }]))).toBeNull());

  test("allows equal times with different messages and equal report latest times", () => {
    expect(validate("data.reports[0].updates[1].publishedAt = data.reports[0].updates[0].publishedAt")).not.toBeNull();
    expect(validate("data.reports[1].updates[0].publishedAt = data.reports[0].updates[1].publishedAt")).not.toBeNull();
  });
});

describe("B3 rendering and independent requests", () => {
  test.each(["zh", "en", "ja"])("%s has complete copy and distinct visible empty/error states", async (locale) => {
    const c = context(locale);
    const copy = c.scope.window.HUIHUI_I18N[locale].systemStatus.incidents;
    expect(Object.keys(copy).sort()).toEqual(Object.keys(context().scope.window.HUIHUI_I18N.en.systemStatus.incidents).sort());
    expect(Object.values(copy).every((text) => text.trim())).toBe(true);
    const container = c.elements.systemStatusIncidents;
    c.scope.fetch.mockResolvedValue(c.response(systemStatusIncidentsFixture()));
    await c.run("loadSystemStatusIncidents()");
    expect(container.dataset.incidentsState).toBe("ready");
    expect(container.children[0].textContent).toBe(copy.empty);
    expect(container.children[0].classList.toggle).toHaveBeenLastCalledWith("system-status-incidents-announcement", false);
    expect(container.children[1].textContent).toContain(copy.fetched);
    c.scope.fetch.mockResolvedValue(c.response({ ...systemStatusIncidentsFixture(), ok: false }));
    await c.run("loadSystemStatusIncidents()");
    expect(container.dataset.incidentsState).toBe("error");
    expect(container.textContent).toBe(copy.unavailable);
    expect(container.textContent).not.toContain(copy.empty);
  });

  test("provider markup stays literal, including scripts and line breaks; keys never reach DOM", async () => {
    const c = context();
    const report = systemStatusIncidentReport(0, 2);
    report.title = '<img src=x onerror="window.executed=true">';
    report.updates[0].message = '<script>window.executed=true</script>\n<p>Plain & literal</p>';
    c.scope.fetch.mockResolvedValue(c.response(systemStatusIncidentsFixture([report])));
    await c.run("loadSystemStatusIncidents()");
    const container = c.elements.systemStatusIncidents;
    expect(container.textContent).toContain(report.title);
    expect(container.textContent).toContain(report.updates[0].message);
    expect(container.textContent).not.toContain(report.key);
    expect(c.scope.window.executed).toBeUndefined();
    const article = container.children[1].children[0];
    expect(article.tagName).toBe("article");
    expect(article.children[0].children[0].tagName).toBe("h3");
    expect(article.children[0].children[1].href).toBe(report.url);
    expect(article.children[1].tagName).toBe("ol");
    expect(article.children[1].children.map((li) => li.children[0].dateTime)).toEqual(report.updates.map((u) => u.publishedAt));
    expect(container.children[0].textContent).toBe("Incident history loaded.");
  });

  test("Home has no incidents request or lifecycle registration", async () => {
    const c = context();
    delete c.elements.systemStatusIncidents;
    await c.run("loadSystemStatusIncidents()");
    expect(c.scope.fetch).not.toHaveBeenCalled();
    expect(c.listeners.size).toBe(0);
  });

  test.each(["http", "network", "json", "contract"])("%s failure removes stale reports and successful fetched-at data", async (failure) => {
    const c = context();
    c.scope.fetch.mockResolvedValueOnce(c.response(systemStatusIncidentsFixture([systemStatusIncidentReport()])));
    await c.run("loadSystemStatusIncidents()");
    expect(c.elements.systemStatusIncidents.textContent).toContain("Status report 1");
    if (failure === "network") c.scope.fetch.mockRejectedValueOnce(new Error("network failure"));
    else if (failure === "json") c.scope.fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("invalid JSON"); } });
    else if (failure === "http") c.scope.fetch.mockResolvedValueOnce({ ok: false });
    else c.scope.fetch.mockResolvedValueOnce(c.response({ ...systemStatusIncidentsFixture(), source: "other" }));
    await c.run("loadSystemStatusIncidents()");
    expect(c.elements.systemStatusIncidents.textContent).toBe("Incident history is currently unavailable.");
    expect(c.elements.systemStatusIncidents.dataset.incidentsState).toBe("error");
  });

  test.each(["incidents", "history", "current"])("%s failure leaves other layers valid", async (failure) => {
    const c = context();
    const payloads = { "/api/system-status": systemStatusFixture(), "/api/system-status/history": systemStatusHistoryFixture(),
      "/api/system-status/incidents": systemStatusIncidentsFixture([systemStatusIncidentReport()]) };
    c.scope.fetch.mockImplementation(async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith(failure === "current" ? "/system-status" : `/${failure}`)) throw new Error("fixture failure");
      return c.response(payloads[pathname]);
    });
    await c.run("Promise.all([loadSystemStatus(), loadSystemStatusHistory(), loadSystemStatusIncidents()])");
    expect(c.current.dataset.status).toBe(failure === "current" ? "unknown" : "operational");
    expect(c.elements.systemStatusHistory.dataset.historyState).toBe(failure === "history" ? "error" : "ready");
    expect(c.elements.systemStatusIncidents.dataset.incidentsState).toBe(failure === "incidents" ? "error" : "ready");
    expect(new Set(c.scope.fetch.mock.calls.map(([, options]) => options.signal)).size).toBe(3);
  });

  test("independent 6-second timeout ignores a late success without retry", async () => {
    vi.useFakeTimers();
    const c = context();
    let resolve;
    c.scope.fetch.mockReturnValue(new Promise((done) => { resolve = done; }));
    const request = c.run("loadSystemStatusIncidents()");
    expect(c.elements.systemStatusIncidents.dataset.incidentsState).toBe("loading");
    await vi.advanceTimersByTimeAsync(6000);
    expect(c.scope.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(c.elements.systemStatusIncidents.dataset.incidentsState).toBe("error");
    resolve(c.response(systemStatusIncidentsFixture()));
    await request;
    expect(c.elements.systemStatusIncidents.dataset.incidentsState).toBe("error");
    expect(c.scope.fetch).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])("new request wins over stale success/error (%s)", async (rejectOld) => {
    const c = context();
    let resolve, reject;
    c.scope.fetch.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
    const first = c.run("loadSystemStatusIncidents()");
    c.scope.fetch.mockResolvedValueOnce(c.response(systemStatusIncidentsFixture([systemStatusIncidentReport()])));
    await c.run("loadSystemStatusIncidents()");
    expect(c.scope.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    if (rejectOld) reject(new Error("old request"));
    else resolve(c.response(systemStatusIncidentsFixture()));
    await first;
    expect(c.elements.systemStatusIncidents.textContent).toContain("Status report 1");
  });

  test("pagehide invalidates pending work; persisted pageshow independently reloads B3", async () => {
    const c = context();
    let resolve;
    c.scope.fetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = c.run("loadSystemStatusIncidents()");
    for (const handler of c.listeners.get("pagehide")) handler();
    expect(c.scope.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    resolve(c.response(systemStatusIncidentsFixture()));
    await pending;
    expect(c.elements.systemStatusIncidents.dataset.incidentsState).toBe("loading");
    c.scope.fetch.mockResolvedValue(c.response(systemStatusIncidentsFixture()));
    for (const handler of c.listeners.get("pageshow")) handler({ persisted: true });
    await vi.waitFor(() => expect(c.elements.systemStatusIncidents.dataset.incidentsState).toBe("ready"));
    expect(c.scope.fetch).toHaveBeenCalledTimes(2);
    expect(c.listeners.get("pageshow").size).toBe(1);
    expect(c.listeners.get("pagehide").size).toBe(0);
  });

  test("replaced section cannot be overwritten by an old response", async () => {
    const c = context();
    let resolve;
    c.scope.fetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = c.run("loadSystemStatusIncidents()");
    c.elements.systemStatusIncidents = element("section");
    resolve(c.response(systemStatusIncidentsFixture()));
    await pending;
    expect(c.elements.systemStatusIncidents.children).toEqual([]);
  });
});
