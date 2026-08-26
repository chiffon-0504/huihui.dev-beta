import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import worker, {
  CONTACT_REQUEST_MAX_BYTES,
  STEAM_RESPONSE_MAX_BYTES,
  STEAM_UPSTREAM_DEADLINE_MS,
  TECH_NEWS_RESPONSE_MAX_BYTES,
  TECH_NEWS_SOURCE_DEADLINE_MS,
  TURNSTILE_RESPONSE_MAX_BYTES,
} from "../../workers/huihui-api/worker.js";

const apiOrigin = "https://api.example.test";
const productionOrigin = "https://huihui.dev";
const techNewsSourceUrls = [
  "https://openai.com/news/rss.xml",
  "https://developer.apple.com/news/rss/news.rss",
  "https://android-developers.googleblog.com/feeds/posts/default",
];
const steamEnv = {
  STEAM_API_KEY: "test-steam-api-key",
  STEAM_ID: "test-steam-id",
};
const contactEnv = {
  WORKER_ENV: "production",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  FORMSPREE_ENDPOINT: "https://formspree.example.test/contact",
};
const turnstileUrl =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const approvedKeys = new Set([
  "event",
  "route",
  "upstream",
  "category",
  "httpStatus",
  "attemptDayOffset",
]);
const approvedEvents = new Set([
  "worker_upstream_failure",
  "worker_configuration_failure",
  "worker_unhandled_failure",
]);
const approvedRoutes = new Set([
  "/api/tech-news",
  "/api/apod",
  "/api/steam-library",
  "/api/contact",
  "/api/unknown",
]);
const approvedUpstreams = new Set([
  "openai_rss",
  "apple_rss",
  "android_rss",
  "nasa_apod",
  "steam",
  "turnstile",
  "formspree",
  "worker",
]);
const approvedCategories = new Set([
  "network",
  "http_status",
  "timeout",
  "parse",
  "size_limit",
  "invalid_response",
  "missing_config",
  "unhandled",
]);

let warnSpy;
let errorSpy;
let infoSpy;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rssResponse(title = "Article") {
  return new Response(
    `<rss><channel><item><title>${title}</title>` +
      `<link>https://articles.example.test/${title}</link>` +
      `<pubDate>Sun, 02 Aug 2026 12:00:00 GMT</pubDate>` +
      `</item></channel></rss>`,
    { status: 200, headers: { "Content-Type": "application/rss+xml" } },
  );
}

function apodResponse(date, overrides = {}) {
  return jsonResponse({
    media_type: "image",
    url: `https://images.example.test/${date}.jpg`,
    hdurl: `https://images.example.test/${date}-hd.jpg`,
    title: `APOD ${date}`,
    date,
    explanation: `Explanation ${date}`,
    ...overrides,
  });
}

function steamResponse(games) {
  return jsonResponse({ response: { games } });
}

function contactFormData(overrides = {}) {
  const values = {
    name: "Test User",
    email: "test@example.com",
    message: "Hello from the Contact form.",
    "cf-turnstile-response": "test-turnstile-token",
    ...overrides,
  };
  const formData = new FormData();

  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) formData.set(name, value);
  }

  return formData;
}

function contactRequest({
  body = contactFormData(),
  headers = {},
  method = "POST",
  url = `${apiOrigin}/api/contact`,
} = {}) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Origin", productionOrigin);

  return new Request(url, {
    method,
    headers: requestHeaders,
    body: method === "POST" ? body : undefined,
  });
}

function successfulTurnstileResponse(overrides = {}) {
  return jsonResponse({
    success: true,
    hostname: "huihui.dev",
    action: "contact",
    ...overrides,
  });
}

function startWorker(requestOrPath, env = {}) {
  const pendingTasks = [];
  const request =
    typeof requestOrPath === "string"
      ? new Request(`${apiOrigin}${requestOrPath}`)
      : requestOrPath;
  const responsePromise = worker.fetch(request, env, {
    waitUntil(task) {
      pendingTasks.push(task);
    },
  });

  return { pendingTasks, responsePromise };
}

async function finishWorker(started) {
  const response = await started.responsePromise;
  await Promise.all(started.pendingTasks);
  return response;
}

function allLogCalls() {
  return [
    ...warnSpy.mock.calls.map((args) => ({ level: "warn", args })),
    ...errorSpy.mock.calls.map((args) => ({ level: "error", args })),
    ...infoSpy.mock.calls.map((args) => ({ level: "info", args })),
  ];
}

function expectSingleLog(level, expected) {
  const selectedSpy = level === "warn" ? warnSpy : errorSpy;
  const otherSpy = level === "warn" ? errorSpy : warnSpy;

  expect(selectedSpy.mock.calls).toEqual([[expected]]);
  expect(otherSpy).not.toHaveBeenCalled();
  expect(infoSpy).not.toHaveBeenCalled();
}

function expectNoLogs() {
  expect(warnSpy).not.toHaveBeenCalled();
  expect(errorSpy).not.toHaveBeenCalled();
  expect(infoSpy).not.toHaveBeenCalled();
}

function expectApprovedLogContract() {
  for (const { args } of allLogCalls()) {
    expect(args).toHaveLength(1);
    const event = args[0];
    expect(event).not.toBeInstanceOf(Error);
    expect(event).toEqual(expect.any(Object));
    expect(Object.keys(event).every((key) => approvedKeys.has(key))).toBe(true);
    expect(approvedEvents.has(event.event)).toBe(true);
    expect(approvedRoutes.has(event.route)).toBe(true);
    expect(approvedUpstreams.has(event.upstream)).toBe(true);
    expect(approvedCategories.has(event.category)).toBe(true);

    if ("httpStatus" in event) {
      expect(Number.isInteger(event.httpStatus)).toBe(true);
      expect(event.httpStatus).toBeGreaterThanOrEqual(100);
      expect(event.httpStatus).toBeLessThanOrEqual(599);
    }

    if ("attemptDayOffset" in event) {
      expect(event.upstream).toBe("nasa_apod");
      expect(Number.isInteger(event.attemptDayOffset)).toBe(true);
      expect(event.attemptDayOffset).toBeGreaterThanOrEqual(0);
      expect(event.attemptDayOffset).toBeLessThanOrEqual(7);
    }
  }
}

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal("caches", {
    default: {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    },
  });
});

afterEach(() => {
  expectApprovedLogContract();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Worker structured observability", () => {
  test("logs one Tech News timeout while preserving the partial HTTP 200 fallback", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url) =>
      url === techNewsSourceUrls[0]
        ? new Promise(() => {})
        : Promise.resolve(rssResponse("Healthy")),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = startWorker("/api/tech-news");
    await vi.advanceTimersByTimeAsync(TECH_NEWS_SOURCE_DEADLINE_MS);
    const response = await finishWorker(pending);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.techNews[0]).toMatchObject({
      source: "OpenAI News",
      title: "OpenAI News",
      description: "來源暫時無法讀取",
    });
    expectSingleLog("warn", {
      event: "worker_upstream_failure",
      route: "/api/tech-news",
      upstream: "openai_rss",
      category: "timeout",
    });
  });

  test("logs a bounded Tech News oversized-body event", async () => {
    const fetchMock = vi.fn((url) =>
      Promise.resolve(
        url === techNewsSourceUrls[0]
          ? new Response("oversized", {
              headers: {
                "Content-Length": String(TECH_NEWS_RESPONSE_MAX_BYTES + 1),
              },
            })
          : rssResponse("Healthy"),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(startWorker("/api/tech-news"));

    expect(response.status).toBe(200);
    expect((await response.json()).techNews[0].title).toBe("OpenAI News");
    expectSingleLog("warn", {
      event: "worker_upstream_failure",
      route: "/api/tech-news",
      upstream: "openai_rss",
      category: "size_limit",
    });
  });

  test("logs only the known status for a Tech News non-2xx response", async () => {
    const fetchMock = vi.fn((url) =>
      Promise.resolve(
        url === techNewsSourceUrls[0]
          ? new Response(null, { status: 503 })
          : rssResponse("Healthy"),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(startWorker("/api/tech-news"));

    expect(response.status).toBe(200);
    expectSingleLog("warn", {
      event: "worker_upstream_failure",
      route: "/api/tech-news",
      upstream: "openai_rss",
      category: "http_status",
      httpStatus: 503,
    });
  });

  test("logs an APOD upstream exception with its bounded attempt offset", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("private APOD failure"))
        .mockResolvedValueOnce(apodResponse("2026-08-25")),
    );

    const response = await finishWorker(startWorker("/api/apod"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ fallback: true, daysBack: 1 });
    expectSingleLog("warn", {
      event: "worker_upstream_failure",
      route: "/api/apod",
      upstream: "nasa_apod",
      category: "network",
      attemptDayOffset: 0,
    });
  });

  test("keeps a normal APOD video to older-image lookup silent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          apodResponse("2026-08-26", {
            media_type: "video",
            url: "https://video.example.test/apod",
          }),
        )
        .mockResolvedValueOnce(apodResponse("2026-08-25")),
    );

    const response = await finishWorker(startWorker("/api/apod"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ fallback: true, daysBack: 1 });
    expectNoLogs();
  });

  test("logs a Steam timeout while preserving its fallback response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const pending = startWorker("/api/steam-library", steamEnv);
    await vi.advanceTimersByTimeAsync(STEAM_UPSTREAM_DEADLINE_MS);
    const response = await finishWorker(pending);

    expect(response.status).toBe(500);
    expect(response.headers.get("X-Cache")).toBe("FALLBACK");
    expect(await response.json()).toEqual({
      ok: false,
      source: "Steam",
      message: "Steam library temporarily unavailable",
      games: [],
    });
    expectSingleLog("warn", {
      event: "worker_upstream_failure",
      route: "/api/steam-library",
      upstream: "steam",
      category: "timeout",
    });
  });

  test.each([
    ["parse", new Response("{not-json")],
    ["invalid_response", steamResponse({ malformed: true })],
  ])("logs a Steam %s failure", async (category, upstreamResponse) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstreamResponse));

    const response = await finishWorker(
      startWorker("/api/steam-library", steamEnv),
    );

    expect(response.status).toBe(500);
    expectSingleLog("warn", {
      event: "worker_upstream_failure",
      route: "/api/steam-library",
      upstream: "steam",
      category,
    });
  });

  test("logs missing required Steam configuration as an operator error", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const response = await finishWorker(
      startWorker("/api/steam-library", { STEAM_ID: "configured" }),
    );

    expect(response.status).toBe(500);
    expectSingleLog("error", {
      event: "worker_configuration_failure",
      route: "/api/steam-library",
      upstream: "steam",
      category: "missing_config",
    });
  });

  test("logs a Turnstile timeout while preserving the structured 504", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const pending = startWorker(contactRequest(), contactEnv);
    await vi.advanceTimersByTimeAsync(5000);
    const response = await finishWorker(pending);

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Turnstile verification timed out",
    });
    expectSingleLog("warn", {
      event: "worker_upstream_failure",
      route: "/api/contact",
      upstream: "turnstile",
      category: "timeout",
    });
  });

  test.each([
    ["parse", new Response("not-json"), undefined],
    [
      "size_limit",
      new Response("oversized", {
        headers: {
          "Content-Length": String(TURNSTILE_RESPONSE_MAX_BYTES + 1),
        },
      }),
      undefined,
    ],
    ["invalid_response", jsonResponse({ unexpected: true }), undefined],
    ["http_status", new Response(null, { status: 503 }), 503],
  ])("logs a Turnstile %s failure", async (category, upstreamResponse, httpStatus) => {
    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(
      startWorker(contactRequest(), contactEnv),
    );

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(turnstileUrl);
    const expectedEvent = {
      event: "worker_upstream_failure",
      route: "/api/contact",
      upstream: "turnstile",
      category,
    };
    if (httpStatus !== undefined) expectedEvent.httpStatus = httpStatus;
    expectSingleLog("warn", expectedEvent);
  });

  test("keeps a normal invalid Turnstile token rejection silent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
      ),
    );

    const response = await finishWorker(
      startWorker(contactRequest(), contactEnv),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Turnstile verification failed",
      errorCodes: ["invalid-input-response"],
    });
    expectNoLogs();
  });

  test("logs an invalid Turnstile secret as a configuration failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: false,
          "error-codes": ["invalid-input-secret"],
        }),
      ),
    );

    const response = await finishWorker(
      startWorker(contactRequest(), contactEnv),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Turnstile verification failed",
      errorCodes: ["invalid-input-secret"],
    });
    expectSingleLog("error", {
      event: "worker_configuration_failure",
      route: "/api/contact",
      upstream: "turnstile",
      category: "missing_config",
    });
  });

  test.each([
    ["TURNSTILE_SECRET_KEY", "turnstile"],
    ["FORMSPREE_ENDPOINT", "formspree"],
  ])("logs missing Contact %s configuration", async (binding, upstream) => {
    const env = { ...contactEnv };
    delete env[binding];
    vi.stubGlobal("fetch", vi.fn());

    const response = await finishWorker(startWorker(contactRequest(), env));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Contact service unavailable",
    });
    expectSingleLog("error", {
      event: "worker_configuration_failure",
      route: "/api/contact",
      upstream,
      category: "missing_config",
    });
  });

  test.each([
    ["action mismatch", { action: "newsletter" }],
    ["hostname mismatch", { hostname: "attacker.example" }],
  ])("keeps Turnstile %s rejection silent", async (_label, overrides) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(successfulTurnstileResponse(overrides)),
    );

    const response = await finishWorker(
      startWorker(contactRequest(), contactEnv),
    );

    expect(response.status).toBe(403);
    expectNoLogs();
  });

  test("logs a Formspree timeout as an error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(successfulTurnstileResponse())
        .mockImplementationOnce(() => new Promise(() => {})),
    );

    const pending = startWorker(contactRequest(), contactEnv);
    await vi.advanceTimersByTimeAsync(10000);
    const response = await finishWorker(pending);

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Contact form submission timed out",
    });
    expectSingleLog("error", {
      event: "worker_upstream_failure",
      route: "/api/contact",
      upstream: "formspree",
      category: "timeout",
    });
  });

  test("logs a Formspree non-2xx status without reading its body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(successfulTurnstileResponse())
        .mockResolvedValueOnce(new Response("private upstream body", { status: 503 })),
    );

    const response = await finishWorker(
      startWorker(contactRequest(), contactEnv),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Failed to forward contact form",
    });
    expectSingleLog("error", {
      event: "worker_upstream_failure",
      route: "/api/contact",
      upstream: "formspree",
      category: "http_status",
      httpStatus: 503,
    });
  });

  test("logs an outer exception while preserving the generic JSON 500", async () => {
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => {
          throw new Error("private routing failure");
        }),
        put: vi.fn(async () => undefined),
      },
    });

    const response = await finishWorker(startWorker("/api/tech-news"));
    const responseText = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(responseText)).toEqual({
      ok: false,
      error: "Internal server error",
    });
    expect(responseText).not.toContain("private routing failure");
    expectSingleLog("error", {
      event: "worker_unhandled_failure",
      route: "/api/tech-news",
      upstream: "worker",
      category: "unhandled",
    });
  });

  test("keeps the retired GitHub route silent", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const response = await finishWorker(startWorker("/api/github-updates"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "Not found" });
    expectNoLogs();
  });

  test("keeps normal Contact validation failures silent", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const missingName = contactFormData({ name: undefined });
    const oversized = new URLSearchParams({
      name: "Oversized",
      email: "oversized@example.com",
      message: "small body",
      "cf-turnstile-response": "token",
    });
    const requests = [
      contactRequest({ method: "GET" }),
      contactRequest({ body: missingName }),
      contactRequest({
        body: oversized,
        headers: { "Content-Length": String(CONTACT_REQUEST_MAX_BYTES + 1) },
      }),
    ];

    const responses = [];
    for (const request of requests) {
      responses.push(await finishWorker(startWorker(request, contactEnv)));
    }

    expect(responses.map((response) => response.status)).toEqual([405, 400, 413]);
    expectNoLogs();
  });

  test("never copies sensitive request, configuration, URL, body, or Error data into logs", async () => {
    const markers = {
      apiSecret: "SENSITIVE_API_SECRET_MARKER",
      authorization: "SENSITIVE_AUTHORIZATION_MARKER",
      turnstileToken: "SENSITIVE_TURNSTILE_TOKEN_MARKER",
      steamId: "SENSITIVE_STEAM_ID_MARKER",
      contactName: "SENSITIVE_CONTACT_NAME_MARKER",
      contactEmail: "sensitive-contact-email-marker@example.test",
      contactMessage: "SENSITIVE_CONTACT_MESSAGE_MARKER",
      formspreeEndpoint: "SENSITIVE_FORMSPREE_ENDPOINT_MARKER",
      upstreamBody: "SENSITIVE_UPSTREAM_BODY_MARKER",
      errorMessage: "SENSITIVE_ERROR_MESSAGE_MARKER",
      urlQuery: "SENSITIVE_URL_QUERY_MARKER",
    };
    const sensitiveForm = contactFormData({
      name: markers.contactName,
      email: markers.contactEmail,
      message: markers.contactMessage,
      "cf-turnstile-response": markers.turnstileToken,
    });
    const sensitiveEnv = {
      ...contactEnv,
      TURNSTILE_SECRET_KEY: markers.apiSecret,
      FORMSPREE_ENDPOINT:
        `https://formspree.example.test/contact?token=` +
        markers.formspreeEndpoint,
      STEAM_API_KEY: markers.apiSecret,
      STEAM_ID: markers.steamId,
    };
    const request = contactRequest({
      body: sensitiveForm,
      headers: { Authorization: `Bearer ${markers.authorization}` },
      url: `${apiOrigin}/api/contact?private=${markers.urlQuery}`,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(successfulTurnstileResponse())
        .mockRejectedValueOnce(
          new Error(
            `${markers.errorMessage} ${markers.upstreamBody} ` +
              `${markers.apiSecret} ${markers.steamId}`,
          ),
        ),
    );

    const response = await finishWorker(startWorker(request, sensitiveEnv));

    expect(response.status).toBe(502);
    expectSingleLog("error", {
      event: "worker_upstream_failure",
      route: "/api/contact",
      upstream: "formspree",
      category: "network",
    });
    const serializedLogs = JSON.stringify(allLogCalls());
    for (const marker of Object.values(markers)) {
      expect(serializedLogs).not.toContain(marker);
    }
  });

  test("makes production and beta custom-log privacy explicit in Wrangler", () => {
    const wranglerConfig = readFileSync(
      new URL("../../workers/huihui-api/wrangler.toml", import.meta.url),
      "utf8",
    );

    expect(wranglerConfig).toMatch(
      /\[observability\]\s+enabled = true\s+head_sampling_rate = 1/,
    );
    expect(wranglerConfig).toMatch(
      /\[observability\.logs\]\s+invocation_logs = false/,
    );
    expect(wranglerConfig).toMatch(
      /\[env\.beta\.observability\]\s+enabled = true\s+head_sampling_rate = 1/,
    );
    expect(wranglerConfig).toMatch(
      /\[env\.beta\.observability\.logs\]\s+invocation_logs = false/,
    );
    expect(wranglerConfig.match(/invocation_logs = false/g)).toHaveLength(2);
    expect(wranglerConfig).not.toMatch(/invocation_logs = true/);
    expectNoLogs();
  });
});
