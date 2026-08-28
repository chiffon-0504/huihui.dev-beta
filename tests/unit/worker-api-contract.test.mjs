import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "../../workers/huihui-api/worker.js";

const apiOrigin = "https://api.example.test";
const productionOrigin = "https://huihui.dev";
const betaOrigin = "https://beta.huihui.dev";
const readRoutes = [
  {
    path: "/api/tech-news",
    cachePath: "/api/tech-news?v4",
    payload: { ok: true, techNews: [{ source: "Tech News route" }] },
  },
  {
    path: "/api/infrastructure-status",
    cachePath: "/api/infrastructure-status?v2",
    payload: { ok: true, providers: [] },
  },
  {
    path: "/api/apod",
    cachePath: "/api/apod-v2",
    payload: { ok: true, title: "APOD route" },
  },
  {
    path: "/api/steam-library",
    cachePath: "/api/steam-library-v6",
    payload: { ok: true, source: "Steam route", games: [] },
  },
];

function request(path, options = {}) {
  return new Request(`${apiOrigin}${path}`, options);
}

function stubCache(matchImplementation = async () => undefined) {
  const match = vi.fn(matchImplementation);
  const put = vi.fn(async () => undefined);

  vi.stubGlobal("caches", {
    default: { match, put },
  });

  return { match, put };
}

function context() {
  return { waitUntil: vi.fn() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Worker public API contract", () => {
  test.each(readRoutes)(
    "$path keeps routing GET requests to its existing handler",
    async ({ path, cachePath, payload }) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const cache = stubCache(async (cacheKey) => {
        const url = new URL(cacheKey.url);
        expect(`${url.pathname}${url.search}`).toBe(cachePath);

        return new Response(JSON.stringify(payload), {
          headers: { "Content-Type": "application/json" },
        });
      });

      const response = await worker.fetch(request(path), {}, context());

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Cache")).toBe("HIT");
      expect(await response.json()).toEqual(payload);
      expect(cache.match).toHaveBeenCalledOnce();
      expect(cache.put).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("keeps POST as the Contact route's successful method", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            action: "contact",
            hostname: "huihui.dev",
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    stubCache();

    const formData = new FormData();
    formData.set("name", "Contract Test");
    formData.set("email", "contract@example.com");
    formData.set("message", "Test the existing Contact contract.");
    formData.set("cf-turnstile-response", "test-token");

    const response = await worker.fetch(
      request("/api/contact", {
        method: "POST",
        headers: { Origin: productionOrigin },
        body: formData,
      }),
      {
        WORKER_ENV: "production",
        TURNSTILE_SECRET_KEY: "test-secret",
        FORMSPREE_ENDPOINT: "https://formspree.example.test/contact",
      },
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: "Message sent",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://formspree.example.test/contact",
    );
  });

  test.each(readRoutes)(
    "$path rejects POST with its GET-only method contract",
    async ({ path }) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const cache = stubCache();

      const response = await worker.fetch(
        request(path, { method: "POST" }),
        {},
        context(),
      );

      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
      expect(response.headers.get("Content-Type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(await response.json()).toEqual({
        ok: false,
        error: "Method Not Allowed",
      });
      expect(cache.match).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test.each(readRoutes)(
    "$path keeps CORS preflight separate from GET handling",
    async ({ path }) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const cache = stubCache();

      const response = await worker.fetch(
        request(path, {
          method: "OPTIONS",
          headers: { Origin: productionOrigin },
        }),
        { WORKER_ENV: "production" },
        context(),
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("Allow")).toBe("GET, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, OPTIONS",
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        productionOrigin,
      );
      expect(response.headers.has("Content-Type")).toBe(false);
      expect(await response.text()).toBe("");
      expect(cache.match).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["production", productionOrigin, true],
    ["production", betaOrigin, false],
    ["beta", betaOrigin, true],
    ["beta", productionOrigin, false],
  ])(
    "keeps %s read preflight isolated for %s",
    async (workerEnvironment, origin, isAllowed) => {
      vi.stubGlobal("fetch", vi.fn());
      stubCache();

      const response = await worker.fetch(
        request("/api/tech-news", {
          method: "OPTIONS",
          headers: { Origin: origin },
        }),
        { WORKER_ENV: workerEnvironment },
        context(),
      );

      expect(response.status).toBe(204);

      if (isAllowed) {
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
          origin,
        );
        expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
          "GET, OPTIONS",
        );
      } else {
        expect(response.headers.has("Access-Control-Allow-Origin")).toBe(
          false,
        );
        expect(response.headers.has("Access-Control-Allow-Methods")).toBe(
          false,
        );
      }
    },
  );

  test.each(["/api/github-updates", "/api/does-not-exist"])(
    "%s uses the normal unknown-route response",
    async (path) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const cache = stubCache();

      const response = await worker.fetch(
        request(path),
        {},
        context(),
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ ok: false, error: "Not found" });
      expect(cache.match).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("preserves the API index at the Worker root", async () => {
    vi.stubGlobal("fetch", vi.fn());
    stubCache();

    const response = await worker.fetch(request("/"), {}, context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      message: "huihui.dev API",
      endpoints: [
        "/api/tech-news",
        "/api/infrastructure-status",
        "/api/system-status",
        "/api/health",
        "/api/contact/health",
        "/api/apod",
        "/api/steam-library",
        "/api/contact",
      ],
    });
  });

  test("converts unexpected routing errors into a generic JSON 500", async () => {
    const exceptionMarker = "sensitive-routing-exception-marker";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    stubCache(async () => {
      throw new Error(exceptionMarker);
    });

    const response = await worker.fetch(
      request("/api/tech-news", {
        headers: { Origin: productionOrigin },
      }),
      { WORKER_ENV: "production" },
      context(),
    );
    const responseText = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      productionOrigin,
    );
    expect(JSON.parse(responseText)).toEqual({
      ok: false,
      error: "Internal server error",
    });
    expect(responseText).not.toContain(exceptionMarker);
    expect(responseText).not.toContain("Error:");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
