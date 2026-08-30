import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import worker, {
  SYSTEM_STATUS_INCIDENTS_DEADLINE_MS,
  SYSTEM_STATUS_INCIDENTS_RESPONSE_MAX_BYTES,
} from "../../workers/huihui-api/worker.js";

const route = "/api/system-status/incidents";
const endpoint = `https://api.example.test${route}`;
const origin = "https://status.example.test";
const configuredEnv = { BETTER_STACK_STATUS_PAGE_JSON_URL: `${origin}/index.json` };
const now = "2026-08-31T12:00:00.000Z";
const privateMarker = "private-request-token-body-marker";

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function item(overrides = {}) {
  const fields = {
    title: "API Status 404",
    description: "Investigating the API.",
    link: `${origin}/incident/123`,
    pubDate: "Sun, 30 Aug 2026 12:00:00 -0000",
    guid: `${origin}/incident/123#abc`,
    ...overrides,
  };
  return `<item>${Object.entries(fields).filter(([, value]) => value !== undefined)
    .map(([name, value]) => `<${name}>${escapeXml(value)}</${name}>`).join("")}</item>`;
}

function feed(items = [], channelOrigin = origin) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Incidents | Example</title><description>Public status updates</description>
<link>${channelOrigin}/</link><language>en</language>
<atom:link href="${channelOrigin}/feed.rss" rel="self" type="application/rss+xml"/>
${items.join("\n")}</channel></rss>`;
}

function rssResponse(xml = feed([item()]), options = {}) {
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" }, ...options });
}

async function requestIncidents({
  xml = feed([item()]),
  fetchMock = vi.fn(async () => rssResponse(xml)),
  cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  env = configuredEnv, method = "GET", headers, url = endpoint,
} = {}) {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("caches", { default: cache });
  const tasks = [];
  const response = await worker.fetch(new Request(url, { method, headers }), env, {
    waitUntil(task) { tasks.push(task); },
  });
  await Promise.all(tasks);
  return { response, cache, fetchMock };
}

async function expectFailure(result, category = "invalid_response") {
  const { response, cache } = result;
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Cache")).toBe("BYPASS");
  const data = await response.json();
  expect(data).toEqual({ ok: false, source: "better_stack", reports: [], fetchedAt: expect.any(String) });
  expect(new Date(data.fetchedAt).toISOString()).toBe(data.fetchedAt);
  expect(cache.put).not.toHaveBeenCalled();
  expect(warnSpy).toHaveBeenLastCalledWith({
    event: "worker_upstream_failure", route, upstream: "better_stack_rss", category,
  });
  return data;
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

describe("Better Stack public incident history", () => {
  test("validated empty channel is a cacheable success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const { response, cache } = await requestIncidents({ xml: feed() });
    expect(await response.json()).toEqual({ ok: true, source: "better_stack", reports: [], fetchedAt: now });
    expect(response.headers.get("X-Cache")).toBe("MISS");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(cache.put).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("GET emits only the public contract and an opaque URL-derived key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const { response, cache, fetchMock } = await requestIncidents({
      headers: { Authorization: privateMarker, Cookie: privateMarker, "X-Trace": privateMarker },
      url: `${endpoint}?url=https://evil.example.test/feed.rss`,
      xml: feed([item({ internal_monitor_url: privateMarker, response_body: privateMarker })]),
    });
    const expected = {
      ok: true, source: "better_stack", fetchedAt: now,
      reports: [{ key: createHash("sha256").update(`${origin}/incident/123`).digest("hex"),
        title: "API Status 404", url: `${origin}/incident/123`,
        updates: [{ publishedAt: "2026-08-30T12:00:00.000Z", message: "Investigating the API." }] }],
    };
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(await response.json()).toEqual(expected);
    expect(await cache.put.mock.calls[0][1].json()).toEqual(expected);
    expect(fetchMock.mock.calls).toEqual([[`${origin}/feed.rss`, {
      method: "GET", headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "huihui.dev system-status-incidents worker" },
      redirect: "manual", cache: "no-store", signal: expect.any(AbortSignal),
    }]]);
    expect(cache.match.mock.calls[0][0].url).toBe(`${endpoint}?v1&source=${encodeURIComponent(`${origin}/feed.rss`)}`);
    expect(JSON.stringify(expected)).not.toContain(privateMarker);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("groups canonical links, keeps identical titles separate, orders updates and reports, and uses the latest title", async () => {
    const { response } = await requestIncidents({ xml: feed([
      item({ link: `${origin}/incident/other`, guid: "other", pubDate: "Sun, 30 Aug 2026 13:00:00 GMT" }),
      item({ title: "Older title", guid: "old", description: "First update" }),
      item({ link: "https://STATUS.EXAMPLE.TEST:443/incident/123/", guid: "latest", description: "Resolved", pubDate: "Sun, 30 Aug 2026 14:00:00 GMT" }),
    ]) });
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.reports.map(({ url, title }) => [url, title])).toEqual([
      [`${origin}/incident/123`, "API Status 404"], [`${origin}/incident/other`, "API Status 404"],
    ]);
    expect(data.reports[0].updates).toEqual([
      { publishedAt: "2026-08-30T12:00:00.000Z", message: "First update" },
      { publishedAt: "2026-08-30T14:00:00.000Z", message: "Resolved" },
    ]);
    expect(data.reports[0].key).not.toBe(data.reports[1].key);
  });

  test("deduplicates matching GUIDs and identical normalized updates with distinct GUIDs", async () => {
    const { response } = await requestIncidents({ xml: feed([item(), item(), item({ guid: "another-guid" })]) });
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.reports).toHaveLength(1);
    expect(data.reports[0].updates).toHaveLength(1);
  });

  test.each(["description", "link", "title", "pubDate"])("conflicting duplicate GUID invalidates the entire payload: %s", async (field) => {
    const values = { description: "Changed", link: `${origin}/incident/456`, title: "Changed", pubDate: "Sun, 30 Aug 2026 13:00:00 GMT" };
    await expectFailure(await requestIncidents({ xml: feed([item(), item({ [field]: values[field] })]) }));
  });

  test.each(["title", "description", "link", "pubDate", "guid"])("rejects missing, empty, duplicate, or nested %s", async (field) => {
    for (const xml of [
      feed([item({ [field]: undefined })]), feed([item({ [field]: " \n " })]),
      feed([item().replace("</item>", `<${field}>duplicate</${field}></item>`)]),
      feed([item().replace(`<${field}>`, `<${field}><child/>`)]),
    ]) await expectFailure(await requestIncidents({ xml }));
  });

  test.each([
    "bad date", "2026-08-30T12:00:00Z", "Sun, 30 Aug 2026 12:00:00", "Sun, 30 Aug 2026 12:00:00 XYZ",
    "Mon, 30 Aug 2026 12:00:00 GMT", "Tue, 31 Feb 2026 12:00:00 GMT", "Sun, 00 Aug 2026 12:00:00 GMT",
    "Sun, 30 Aug 2026 24:00:00 GMT", "Sun, 30 Aug 2026 12:60:00 GMT", "Sun, 30 Aug 2026 12:00:60 GMT",
    "Sun, 30 Aug 2026 12:00:00 +2400", "Sun, 30 Aug 2026 12:00:00 +0060", "30 Aug 1800 12:00:00 GMT",
  ])("rejects invalid RSS date without substituting now: %s", async (pubDate) => {
    await expectFailure(await requestIncidents({ xml: feed([item({ pubDate })]) }));
  });

  test.each([
    ["Sun, 30 Aug 2026 20:00:00 +0800", "2026-08-30T12:00:00.000Z"],
    ["30 Aug 26 12:00 UT", "2026-08-30T12:00:00.000Z"],
    ["Sun, 30 Aug 2026 08:00:00 EDT", "2026-08-30T12:00:00.000Z"],
    ["Sun, 30 Aug 2026 10:00:00 -0200", "2026-08-30T12:00:00.000Z"],
  ])("serializes supported RFC dates in UTC: %s", async (pubDate, expected) => {
    const { response } = await requestIncidents({ xml: feed([item({ pubDate })]) });
    expect((await response.json()).reports[0].updates[0].publishedAt).toBe(expected);
  });

  test.each([
    "https://foreign.example.test/incident/123", "http://status.example.test/incident/123",
    "https://user:pass@status.example.test/incident/123", "https://user@status.example.test/incident/123",
    "https://status.example.test:444/incident/123", "https://status.example.test/incident/123?token=secret",
    "https://status.example.test/incident/123#anchor", "/incident/123", "not a URL",
    "https://status.example.test/monitors/123", "https://status.example.test/incidents", "https://status.example.test/status-reports/123",
    "https://status.example.test/other/../incident/123", "https://status.example.test/incident/%31", "https://status.example.test/incident/../123",
    "https://status.example.test/incident/123/child", "https://status.example.test/incident/12\\3", `https://status.example.test/incident/${"a".repeat(129)}`,
  ])("rejects untrusted/non-public incident links: %s", async (link) => {
    await expectFailure(await requestIncidents({ xml: feed([item({ link })]) }));
  });

  test.each([
    "", "<html></html>", "<feed></feed>", "<rss version=\"2.0\"><channel/></rss>",
    feed().replace("</rss>", ""), feed() + "<rss/>", feed().replace("</channel>", "</wrong>"),
    feed().replace('version="2.0"', 'version="1.0"'), feed().replace('version="2.0"', 'version="2.0" version="2.0"'),
    feed().replace("<channel>", '<channel xmlns="evil">'), feed().replace("Public status updates", "&unknown;"),
    feed().replace(' xmlns:atom="http://www.w3.org/2005/Atom"', ""), feed().replace("<channel>", '<channel unknown:attr="value">'),
    feed().replace("Public status updates", "bad & text"), feed().replace("Public status updates", "&#0;"),
    feed().replace('version="1.0"', 'version="1.0\''), feed().replace('rss version=', 'rss\u00a0version='),
    feed().replace("Public status updates", "&#X41;"), feed() + "\u00a0",
    feed().replace("<channel>", "<channel><!-- bad -- comment -->"), feed().replace("<channel>", "<channel><?processing instruction?>"),
    feed().replace("<channel>", "<channel>unwrapped text"), feed().replace("<channel>", "<channel>]]>"),
    feed().replace("</channel>", `<extension>${item()}</extension></channel>`),
    '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "https://evil.test/private">]>' + feed(),
    feed().replace("<channel>", "<channel>\u0000"), feed().replace(`${origin}/</link>`, "https://foreign.test/</link>"),
  ])("fails closed for malformed XML/channel, non-RSS roots or unsupported constructs (%#)", async (xml) => {
    await expectFailure(await requestIncidents({ xml }));
  });

  test("accepts comments and CDATA while stripping markup and hidden content", async () => {
    const description = '<p>Investigating <strong>API</strong>.</p><script>alert("secret")</script><style>private css</style>' +
      '<div>Next<br>line <a href="https://private.test/monitor" onclick="secret()">details</a><!-- private comment --></div>';
    const xml = feed([item({ description: "PLACEHOLDER" })]).replace("PLACEHOLDER", `<![CDATA[${description}]]>`);
    const { response } = await requestIncidents({ xml });
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.reports[0].updates[0].message).toBe("Investigating API.\n\nNext\nline details");
    expect(JSON.stringify(data)).not.toMatch(/<|script|onclick|private|alert/);
  });

  test.each([
    '<img src=x onerror="evil()">Safe text', '&lt;img src=x onerror="evil()"&gt;Safe text',
    '<svg><script>evil()</script></svg>Safe text', '<iframe>private</iframe>Safe text',
  ])("converts formatted and encoded executable markup to plain text (%#)", async (description) => {
    const { response } = await requestIncidents({ xml: feed([item({ description })]) });
    expect((await response.json()).reports[0].updates[0].message).toBe("Safe text");
  });

  test.each(['<script>unclosed', '<p title="broken>text', 'hello <', '<style>only hidden</style>', '<img src=x>'])
  ("fails closed when markup is ambiguous or leaves no readable message (%#)", async (description) => {
    await expectFailure(await requestIncidents({ xml: feed([item({ description })]) }));
  });

  test("rejects long unterminated tags within bounded parsing work", async () => {
    await expectFailure(await requestIncidents({ xml: feed([item({ description: `<p ${" ".repeat(100_000)}` })]) }));
    await expectFailure(await requestIncidents({ xml: `<rss ${" ".repeat(100_000)}` }));
  });

  test("decodes XML/HTML/numeric entities and normalizes whitespace without losing Unicode", async () => {
    const { response } = await requestIncidents({ xml: feed([item({
      title: "API & Contact",
      description: '  A &amp; B&nbsp;&quot;quoted&quot; &#39;x&#39; &copy; &mdash; &#x1F680; &#26085; &unknown;\r\n \n\n  next  ',
    })]) });
    const data = await response.json();
    expect(data.reports[0].title).toBe("API & Contact");
    expect(data.reports[0].updates[0].message).toBe('A & B "quoted" \'x\' © — 🚀 日 &unknown;\n\nnext');
  });

  test.each(["&#x110000;", "&#xD800;", "&#0;"])("rejects invalid formatted-content code points: %s", async (description) => {
    await expectFailure(await requestIncidents({ xml: feed([item({ description })]) }));
  });

  test.each([["title", 200], ["description", 4000], ["guid", 512]])("enforces %s length after normalization", async (field, limit) => {
    const valid = await requestIncidents({ xml: feed([item({ [field]: "a".repeat(limit) })]) });
    expect((await valid.response.json()).ok).toBe(true);
    await expectFailure(await requestIncidents({ xml: feed([item({ [field]: "a".repeat(limit + 1) })]) }));
  });

  test("returns latest 20 reports and latest 20 unique updates per report, validating even omitted items", async () => {
    const reports = Array.from({ length: 25 }, (_, index) => item({ link: `${origin}/incident/${index}`, guid: `report-${index}`, pubDate: `Sun, 30 Aug 2026 12:${String(index).padStart(2, "0")}:00 GMT` }));
    const updates = Array.from({ length: 25 }, (_, index) => item({ link: `${origin}/incident/latest`, guid: `update-${index}`, description: `Update ${index}`, pubDate: `Sun, 30 Aug 2026 13:${String(index).padStart(2, "0")}:00 GMT` }));
    const { response } = await requestIncidents({ xml: feed([...reports, ...updates]) });
    const data = await response.json();
    expect(data.reports).toHaveLength(20);
    expect(data.reports[0].url).toBe(`${origin}/incident/latest`);
    expect(data.reports[0].updates.map(({ message }) => message)).toEqual(Array.from({ length: 20 }, (_, index) => `Update ${index + 5}`));
    expect(data.reports.at(-1).url).toBe(`${origin}/incident/6`);
    await expectFailure(await requestIncidents({ xml: feed([...reports, ...updates, item({ guid: "old-bad", pubDate: "bad" })]) }));
  });

  test("enforces source item, XML node and depth limits", async () => {
    const valid = await requestIncidents({ xml: feed(Array(512).fill(item())) });
    expect((await valid.response.json()).ok).toBe(true);
    for (const xml of [feed(Array(513).fill(item())), feed().replace("</channel>", "<x/>".repeat(8192) + "</channel>"),
      feed().replace("</channel>", "<x>".repeat(17) + "</x>".repeat(17) + "</channel>")]) {
      await expectFailure(await requestIncidents({ xml }));
    }
  });

  test.each(["content-length", "streamed"])("rejects oversized upstream %s and cancels it", async (mode) => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) {
      if (mode === "streamed") controller.enqueue(new Uint8Array(SYSTEM_STATUS_INCIDENTS_RESPONSE_MAX_BYTES + 1));
    }, cancel });
    const headers = { "Content-Type": "application/rss+xml" };
    if (mode === "content-length") headers["Content-Length"] = String(SYSTEM_STATUS_INCIDENTS_RESPONSE_MAX_BYTES + 1);
    await expectFailure(await requestIncidents({ fetchMock: vi.fn(async () => new Response(body, { headers })) }), "size_limit");
    expect(cancel).toHaveBeenCalledOnce();
  });

  test.each([301, 302, 307, 400, 404, 429, 500, 503])("rejects upstream HTTP %s without leaking its response", async (status) => {
    const { response, cache, fetchMock } = await requestIncidents({ fetchMock: vi.fn(async () => rssResponse(privateMarker, { status, headers: { Location: `https://private.test/${privateMarker}` } })) });
    expect(await response.json()).toMatchObject({ ok: false, reports: [] });
    expect(response.headers.get("X-Cache")).toBe("BYPASS");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(cache.put).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls).toEqual([[{ event: "worker_upstream_failure", route, upstream: "better_stack_rss", category: "http_status", httpStatus: status }]]);
  });

  test("network exceptions never leak details", async () => {
    await expectFailure(await requestIncidents({ fetchMock: vi.fn(async () => { throw new Error(privateMarker); }) }), "network");
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(privateMarker);
  });

  test.each(["fetch", "body"])("deadline covers a stalled %s", async (phase) => {
    vi.useFakeTimers();
    let signal;
    const pending = requestIncidents({ fetchMock: vi.fn((_url, options) => {
      signal = options.signal;
      if (phase === "fetch") return new Promise(() => {});
      return rssResponse(new ReadableStream({ start(controller) {
        signal.addEventListener("abort", () => controller.error(new Error(privateMarker)));
      } }));
    }) });
    await vi.advanceTimersByTimeAsync(SYSTEM_STATUS_INCIDENTS_DEADLINE_MS + 1);
    await expectFailure(await pending, "timeout");
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each(["application/rss+xml", "application/xml", "text/xml"])("accepts %s", async (contentType) => {
    const { response } = await requestIncidents({ fetchMock: vi.fn(async () => rssResponse(feed(), { headers: { "Content-Type": contentType } })) });
    expect((await response.json()).ok).toBe(true);
  });

  test("rejects wrong content types and invalid UTF-8", async () => {
    await expectFailure(await requestIncidents({ fetchMock: vi.fn(async () => rssResponse(feed(), { headers: { "Content-Type": "text/html" } })) }));
    await expectFailure(await requestIncidents({ fetchMock: vi.fn(async () => rssResponse(new Uint8Array([0xc3, 0x28]))) }));
  });

  test.each(["http://status.example.test/index.json", `${origin}/index.json?`, `${origin}/index.json#`, `${origin}/feed.rss`,
    "https://user:pass@status.example.test/index.json", `${origin}/a/../index.json`, `${origin}:8443/index.json`, ` ${origin}/index.json`])
  ("rejects unsafe configuration before cache/fetch: %s", async (configured) => {
    const result = await requestIncidents({ env: { BETTER_STACK_STATUS_PAGE_JSON_URL: configured } });
    await expectFailure(result);
    expect(result.cache.match).not.toHaveBeenCalled();
    expect(result.fetchMock).not.toHaveBeenCalled();
  });

  test("missing configuration has only bounded route-specific diagnostics", async () => {
    const { response, cache, fetchMock } = await requestIncidents({ env: {} });
    expect(await response.json()).toMatchObject({ ok: false, reports: [] });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Cache")).toBe("BYPASS");
    expect(errorSpy.mock.calls).toEqual([[{ event: "worker_configuration_failure", route, upstream: "better_stack_rss", category: "missing_config" }]]);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("success MISS -> HIT, then expiry plus error never reuses stale success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    let stored;
    let expiresAt = 0;
    const cache = {
      match: vi.fn(async () => Date.now() < expiresAt ? stored.clone() : undefined),
      put: vi.fn(async (_key, value) => { stored = value; expiresAt = Date.now() + 60_000; }),
    };
    const first = await requestIncidents({ cache });
    const data = await first.response.json();
    await vi.advanceTimersByTimeAsync(59_000);
    const hit = await requestIncidents({ cache, headers: { Origin: "https://huihui.dev" } });
    expect(hit.response.headers.get("X-Cache")).toBe("HIT");
    expect(hit.response.headers.get("Access-Control-Allow-Origin")).toBe("https://huihui.dev");
    expect(await hit.response.json()).toEqual(data);
    expect(hit.fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_001);
    cache.put.mockClear();
    await expectFailure(await requestIncidents({ cache, fetchMock: vi.fn(async () => { throw new Error(privateMarker); }) }), "network");
    const invalid = await requestIncidents({ cache, xml: "<broken>" });
    await expectFailure(invalid);
    const recovered = await requestIncidents({ cache, xml: feed() });
    expect(recovered.response.headers.get("X-Cache")).toBe("MISS");
    expect((await recovered.response.json()).reports).toEqual([]);
  });

  test("cache identity follows validated configuration and is distinct from daily history", async () => {
    const stored = new Map();
    const cache = {
      match: vi.fn(async (key) => stored.get(key.url)?.clone()),
      put: vi.fn(async (key, value) => { stored.set(key.url, value); }),
    };
    await requestIncidents({ cache });
    const changedOrigin = "https://other-status.example.test";
    const second = await requestIncidents({ cache, xml: feed([], changedOrigin), env: { BETTER_STACK_STATUS_PAGE_JSON_URL: `${changedOrigin}/index.json` } });
    expect(second.response.headers.get("X-Cache")).toBe("MISS");
    expect(second.fetchMock.mock.calls[0][0]).toBe(`${changedOrigin}/feed.rss`);
    expect(stored.size).toBe(2);
    expect([...stored.keys()].every((key) => !key.includes("/system-status/history"))).toBe(true);
  });

  test("cache write failure does not discard a valid fetch or log raw errors", async () => {
    const { response } = await requestIncidents({ cache: { match: vi.fn(async () => undefined), put: vi.fn(async () => { throw new Error(privateMarker); }) } });
    expect((await response.json()).ok).toBe(true);
    expect(errorSpy.mock.calls).toEqual([[{ event: "worker_unhandled_failure", route, upstream: "worker", category: "unhandled" }]]);
  });

  test.each(["GET", "OPTIONS"])("preserves production/beta/preview CORS on %s", async (method) => {
    for (const [environment, requestOrigin, allowed] of [
      ["production", "https://huihui.dev", true], ["production", "https://www.huihui.dev", true],
      ["production", "https://beta.huihui.dev", false], ["beta", "https://beta.huihui.dev", true],
      ["beta", "https://huihuidev-beta.pages.dev", true], ["beta", "https://preview.huihuidev-beta.pages.dev", true],
      ["beta", "https://huihui.dev", false], ["beta", "https://huihuidev-beta.pages.dev.evil.test", false],
      ["beta", "http://beta.huihui.dev", false], ["production", "https://evil.test", false],
    ]) {
      const { response, cache, fetchMock } = await requestIncidents({ method, headers: { Origin: requestOrigin }, env: { ...configuredEnv, WORKER_ENV: environment } });
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(allowed ? requestOrigin : null);
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

  test.each(["HEAD", "POST", "PUT", "PATCH", "DELETE"])("rejects %s before cache/upstream access", async (method) => {
    const { response, cache, fetchMock } = await requestIncidents({ method, headers: { Origin: "https://huihui.dev" } });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://huihui.dev");
    expect(await response.json()).toEqual({ ok: false, error: "Method Not Allowed" });
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
