import { afterEach, describe, expect, test, vi } from "vitest";
import {
  assertBrowserCors,
  runLiveSmoke,
} from "../scripts/beta-http-smoke.mjs";

const betaOrigin = "https://beta.huihui.dev";
const apiBaseUrl = "https://huihui-api-beta.huihuigames01.workers.dev";
const techNewsEndpoint = `${apiBaseUrl}/api/tech-news`;
const steamEndpoint = `${apiBaseUrl}/api/steam-library`;
const healthEndpoint = `${apiBaseUrl}/api/health`;
const contactHealthEndpoint = `${apiBaseUrl}/api/contact/health`;
const systemStatusEndpoint = `${apiBaseUrl}/api/system-status`;
const readinessRoutes = [
  [healthEndpoint, "worker_request_path"],
  [contactHealthEndpoint, "configuration_readiness"],
];
const statusEndpoints = [healthEndpoint, contactHealthEndpoint, systemStatusEndpoint];
const healthySteamBody = {
  ok: true,
  source: "Steam",
  count: 0,
  games: [],
};

function jsonResponse(url, body, status = 200) {
  return {
    url,
    status,
    redirected: false,
    headers: new Headers({
      "Access-Control-Allow-Origin": betaOrigin,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    }),
    json: async () => body,
  };
}

function systemStatusBody(overrides = {}) {
  return {
    ok: true,
    status: "operational",
    components: [
      { id: "website", status: "operational" },
      { id: "api", status: "operational" },
      { id: "contact", status: "operational" },
    ],
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

function healthyResponse(url) {
  if (url === techNewsEndpoint) return jsonResponse(url, { ok: true, techNews: [] });
  if (url === steamEndpoint) return jsonResponse(url, healthySteamBody);
  if (url === systemStatusEndpoint) return jsonResponse(url, systemStatusBody());
  const readinessRoute = readinessRoutes.find(([endpoint]) => endpoint === url);
  if (readinessRoute) {
    return jsonResponse(url, { ok: true, status: "operational", scope: readinessRoute[1] });
  }
  throw new Error("Unexpected smoke request");
}

function mockEndpoint(endpoint, response) {
  vi.stubGlobal("fetch", vi.fn(async (url) =>
    url === endpoint ? response : healthyResponse(url),
  ));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Beta HTTP smoke CORS assertion", () => {
  test("accepts the exact browser-visible beta origin", () => {
    const response = new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "https://beta.huihui.dev",
      },
    });

    expect(() => assertBrowserCors(response, techNewsEndpoint)).not.toThrow();
  });

  test.each([
    ["missing", undefined],
    ["wildcard", "*"],
    ["production", "https://huihui.dev"],
  ])("rejects a %s CORS origin", (_label, allowedOrigin) => {
    const headers = new Headers();
    if (allowedOrigin) {
      headers.set("Access-Control-Allow-Origin", allowedOrigin);
    }
    const response = new Response(null, { headers });

    expect(() => assertBrowserCors(response, techNewsEndpoint)).toThrow(
      /expected https:\/\/beta\.huihui\.dev/,
    );
  });
});

describe("Beta HTTP live smoke ownership", () => {
  test("requests exactly the five Worker APIs with the beta browser Origin and no submissions", async () => {
    const fetchMock = vi.fn(async (url) => healthyResponse(url));
    vi.stubGlobal("fetch", fetchMock);

    await runLiveSmoke();

    expect(
      fetchMock.mock.calls.map(([url, init]) => ({
        url,
        origin: init.headers.Origin,
        redirect: init.redirect,
      })),
    ).toEqual([
      { url: techNewsEndpoint, origin: betaOrigin, redirect: "follow" },
      { url: steamEndpoint, origin: betaOrigin, redirect: "follow" },
      { url: healthEndpoint, origin: betaOrigin, redirect: "follow" },
      { url: contactHealthEndpoint, origin: betaOrigin, redirect: "follow" },
      { url: systemStatusEndpoint, origin: betaOrigin, redirect: "follow" },
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  test.each([
    [
      "malformed Tech News JSON",
      techNewsEndpoint,
      {
        ...jsonResponse(techNewsEndpoint, null),
        json: async () => {
          throw new SyntaxError("malformed JSON");
        },
      },
      /invalid top-level JSON value/,
    ],
    [
      "unexpected Steam contract",
      steamEndpoint,
      jsonResponse(steamEndpoint, { ok: true, games: "not-an-array" }),
      /expected success\/degraded response contract/,
    ],
    [
      "non-ready Tech News",
      techNewsEndpoint,
      jsonResponse(techNewsEndpoint, { ok: false, techNews: [] }),
      /expected HTTP 200 techNews contract/,
    ],
    [
      "non-200 Tech News",
      techNewsEndpoint,
      jsonResponse(techNewsEndpoint, { ok: true, techNews: [] }, 503),
      /expected HTTP 200 techNews contract/,
    ],
  ])(
    "fails closed for %s",
    async (_label, invalidUrl, invalidResponse, error) => {
      mockEndpoint(invalidUrl, invalidResponse);

      await expect(runLiveSmoke()).rejects.toThrow(error);
    },
  );

  test("preserves the permitted degraded Steam response", async () => {
    mockEndpoint(steamEndpoint, jsonResponse(steamEndpoint, {
      ok: false,
      source: "Steam",
      message: "Steam library temporarily unavailable",
      games: [],
    }, 500));

    await expect(runLiveSmoke()).resolves.toBeUndefined();
  });
});

describe.each(statusEndpoints)("Beta status/readiness HTTP contract: %s", (endpoint) => {
  test.each([404, 503])("rejects HTTP %s even with a valid payload", async (status) => {
    mockEndpoint(endpoint, { ...healthyResponse(endpoint), status });
    await expect(runLiveSmoke()).rejects.toThrow(/expected HTTP 200/);
  });

  test.each([
    ["missing CORS", "Access-Control-Allow-Origin", null, /expected https:\/\/beta\.huihui\.dev/],
    ["wildcard CORS", "Access-Control-Allow-Origin", "*", /expected https:\/\/beta\.huihui\.dev/],
    ["production CORS", "Access-Control-Allow-Origin", "https://huihui.dev", /expected https:\/\/beta\.huihui\.dev/],
    ["missing Content-Type", "Content-Type", null, /unexpected Content-Type/],
    ["HTML Content-Type", "Content-Type", "text/html", /unexpected Content-Type/],
    ["invalid JSON media type", "Content-Type", "application/jsonp", /unexpected Content-Type/],
    ["missing cache policy", "Cache-Control", null, /Cache-Control: no-store/],
    ["cacheable response", "Cache-Control", "public, max-age=60", /Cache-Control: no-store/],
  ])("fails closed for %s", async (_label, header, value, error) => {
    const response = healthyResponse(endpoint);
    if (value === null) response.headers.delete(header);
    else response.headers.set(header, value);
    mockEndpoint(endpoint, response);

    await expect(runLiveSmoke()).rejects.toThrow(error);
  });

  test.each([
    ["another path", `${apiBaseUrl}/api/tech-news`, /expected canonical URL/],
    ["another origin", "https://huihui.dev/api/health", /unexpected origin/],
  ])("rejects a final URL on %s", async (_label, url, error) => {
    mockEndpoint(endpoint, { ...healthyResponse(endpoint), url });
    await expect(runLiveSmoke()).rejects.toThrow(error);
  });

  test("rejects a redirect even if it returns to the original URL", async () => {
    mockEndpoint(endpoint, { ...healthyResponse(endpoint), redirected: true });
    await expect(runLiveSmoke()).rejects.toThrow(/unexpectedly redirected/);
  });

  test.each([null, [], "operational"])("rejects invalid top-level JSON: %j", async (body) => {
    mockEndpoint(endpoint, jsonResponse(endpoint, body));
    await expect(runLiveSmoke()).rejects.toThrow(/invalid top-level JSON value/);
  });

  test("rejects malformed JSON", async () => {
    mockEndpoint(endpoint, {
      ...healthyResponse(endpoint),
      json: async () => { throw new SyntaxError("malformed JSON"); },
    });
    await expect(runLiveSmoke()).rejects.toThrow(/invalid top-level JSON value/);
  });

  test("rejects a Worker exception response", async () => {
    mockEndpoint(endpoint, jsonResponse(endpoint, { error: "Worker threw exception" }));
    await expect(runLiveSmoke()).rejects.toThrow(/Worker exception response/);
  });

  test("accepts JSON Content-Type with a charset", async () => {
    const response = healthyResponse(endpoint);
    response.headers.set("Content-Type", "application/json; charset=utf-8");
    mockEndpoint(endpoint, response);
    await expect(runLiveSmoke()).resolves.toBeUndefined();
  });
});

describe.each(readinessRoutes)("Beta strict readiness: %s", (endpoint, scope) => {
  test.each([
    ["missing scope", { scope: undefined }],
    ["wrong scope", { scope: "upstream_delivery" }],
    ["missing ok", { ok: undefined }],
    ["non-boolean ok", { ok: "true" }],
    ["non-ready ok", { ok: false }],
    ["missing status", { status: undefined }],
    ["non-ready status", { status: "unknown" }],
  ])("fails closed for %s", async (_label, overrides) => {
    mockEndpoint(endpoint, jsonResponse(endpoint, {
      ok: true, status: "operational", scope, ...overrides,
    }));
    await expect(runLiveSmoke()).rejects.toThrow(/operational readiness contract/);
  });

  test("rejects a non-ready HTTP 503 response", async () => {
    mockEndpoint(endpoint, jsonResponse(endpoint, {
      ok: false, status: "unknown", scope,
    }, 503));
    await expect(runLiveSmoke()).rejects.toThrow(/expected HTTP 200/);
  });
});

describe("Beta System Status public observation contract", () => {
  test.each([
    "operational", "degraded_performance", "partial_outage", "major_outage", "unknown",
  ])("accepts a valid %s observation", async (status) => {
    const body = systemStatusBody({ status });
    body.components[0].status = status;
    mockEndpoint(systemStatusEndpoint, jsonResponse(systemStatusEndpoint, body));

    await expect(runLiveSmoke()).resolves.toBeUndefined();
  });

  test("accepts Unknown overriding a known outage and reordered components", async () => {
    const body = systemStatusBody({
      status: "unknown",
      components: [
        { id: "contact", status: "unknown" },
        { id: "website", status: "major_outage" },
        { id: "api", status: "operational" },
      ],
    });
    mockEndpoint(systemStatusEndpoint, jsonResponse(systemStatusEndpoint, body));

    await expect(runLiveSmoke()).resolves.toBeUndefined();
  });

  test.each([
    ["missing ok", { ok: undefined }],
    ["false ok", { ok: false }],
    ["non-boolean ok", { ok: "true" }],
    ["missing aggregate", { status: undefined }],
    ["unsupported aggregate", { status: "recovered" }],
    ["missing components", { components: undefined }],
    ["non-array components", { components: {} }],
    ["empty components", { components: [] }],
  ])("rejects %s", async (_label, overrides) => {
    mockEndpoint(systemStatusEndpoint, jsonResponse(systemStatusEndpoint, systemStatusBody(overrides)));
    await expect(runLiveSmoke()).rejects.toThrow(/System Status schema/);
  });

  test.each([
    ["missing component", (components) => components.slice(1)],
    ["extra component", (components) => [...components, { id: "database", status: "operational" }]],
    ["duplicate ID", (components) => [components[0], components[0], components[2]]],
    ["unexpected ID", (components) => [{ id: "database", status: "operational" }, ...components.slice(1)]],
    ["null component", (components) => [null, ...components.slice(1)]],
    ["missing component status", (components) => [{ id: "website" }, ...components.slice(1)]],
    ["unsupported component status", (components) => [{ id: "website", status: "under_maintenance" }, ...components.slice(1)]],
  ])("rejects %s", async (_label, change) => {
    const body = systemStatusBody();
    body.components = change(body.components);
    mockEndpoint(systemStatusEndpoint, jsonResponse(systemStatusEndpoint, body));
    await expect(runLiveSmoke()).rejects.toThrow(/System Status schema/);
  });

  test.each(["partial_outage", "unknown"])("rejects a hidden %s component", async (status) => {
    const body = systemStatusBody();
    body.components[0].status = status;
    mockEndpoint(systemStatusEndpoint, jsonResponse(systemStatusEndpoint, body));
    await expect(runLiveSmoke()).rejects.toThrow(/inconsistent aggregate System Status/);
  });

  test.each([
    undefined, null, 123, "not-a-date", "2026-08-28", "2026-02-30T12:34:56.000Z",
  ])("rejects an invalid checkedAt: %j", async (checkedAt) => {
    mockEndpoint(systemStatusEndpoint, jsonResponse(systemStatusEndpoint, systemStatusBody({ checkedAt })));
    await expect(runLiveSmoke()).rejects.toThrow(/invalid execution timestamp/);
  });

  test.each([-120_000, 120_000])("rejects checkedAt outside the execution window (%s ms)", async (offset) => {
    const checkedAt = new Date(Date.now() + offset).toISOString();
    mockEndpoint(systemStatusEndpoint, jsonResponse(systemStatusEndpoint, systemStatusBody({ checkedAt })));
    await expect(runLiveSmoke()).rejects.toThrow(/invalid execution timestamp/);
  });

  test.each([-30_000, 30_000])("allows modest Worker/CI clock skew (%s ms)", async (offset) => {
    const checkedAt = new Date(Date.now() + offset).toISOString();
    mockEndpoint(systemStatusEndpoint, jsonResponse(systemStatusEndpoint, systemStatusBody({ checkedAt })));
    await expect(runLiveSmoke()).resolves.toBeUndefined();
  });
});
