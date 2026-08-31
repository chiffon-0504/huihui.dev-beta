import { afterEach, describe, expect, test, vi } from "vitest";
import worker, {
  SYSTEM_STATUS_WEBSITE_DEADLINE_MS,
  SYSTEM_STATUS_WEBSITE_RESPONSE_MAX_BYTES,
  aggregateSystemStatus,
  normalizeApiReadinessPayload,
} from "../../workers/huihui-api/worker.js";

const apiOrigin = "https://api.example.test";
const productionOrigin = "https://huihui.dev";
const healthyHtml = `<!doctype html><html><head><link rel="canonical" href="https://huihui.dev/" /></head><body>healthy</body></html>`;
const healthyEnv = {
  WORKER_ENV: "production",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  FORMSPREE_ENDPOINT: "https://formspree.example.test/f/system-status",
};

function request(path = "/api/system-status", options = {}) {
  return new Request(`${apiOrigin}${path}`, options);
}

function context() {
  return { waitUntil: vi.fn() };
}

function htmlResponse(body = healthyHtml, init = {}) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    ...init,
  });
}

async function getSystemStatus({ env = healthyEnv, fetchMock } = {}) {
  vi.stubGlobal("fetch", fetchMock || vi.fn(async () => htmlResponse()));
  const response = await worker.fetch(request(), env, context());
  return { response, data: await response.json() };
}

function component(data, id) {
  return data.components.find((candidate) => candidate.id === id);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("huihui.dev current System Status Worker", () => {
  test("returns all three operational components with an execution timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:34:56.000Z"));
    const fetchMock = vi.fn(async () => htmlResponse());
    const { response, data } = await getSystemStatus({ fetchMock });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.has("X-Cache")).toBe(false);
    expect(data).toEqual({
      ok: true,
      status: "operational",
      components: [
        { id: "website", status: "operational" },
        { id: "api", status: "operational" },
        { id: "contact", status: "operational" },
      ],
      checkedAt: "2026-08-28T12:34:56.000Z",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://huihui.dev/");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      redirect: "manual",
      cache: "no-store",
    });
  });

  test("uses the fixed beta Website target in the beta Worker environment", async () => {
    const fetchMock = vi.fn(async () => htmlResponse());
    await getSystemStatus({
      env: { ...healthyEnv, WORKER_ENV: "beta" },
      fetchMock,
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://beta.huihui.dev/");
  });

  test.each([
    [503, "major_outage"],
    [404, "partial_outage"],
  ])("maps a definite Website HTTP %s to %s", async (status, expected) => {
    const { data } = await getSystemStatus({
      fetchMock: vi.fn(async () => new Response("failure", { status })),
    });

    expect(component(data, "website").status).toBe(expected);
    expect(data.status).toBe(expected);
  });

  test.each([
    ["application/json", healthyHtml],
    ["text/html", "<html><body>missing marker</body></html>"],
  ])("treats invalid Website content as a partial outage", async (contentType, body) => {
    const { data } = await getSystemStatus({
      fetchMock: vi.fn(async () =>
        new Response(body, { status: 200, headers: { "Content-Type": contentType } }),
      ),
    });

    expect(component(data, "website").status).toBe("partial_outage");
    expect(data.status).toBe("partial_outage");
  });

  test("turns Website timeout ambiguity into Unknown", async () => {
    vi.useFakeTimers();
    const pending = getSystemStatus({ fetchMock: vi.fn(() => new Promise(() => {})) });

    await vi.advanceTimersByTimeAsync(SYSTEM_STATUS_WEBSITE_DEADLINE_MS);
    const { data } = await pending;

    expect(component(data, "website").status).toBe("unknown");
    expect(component(data, "api").status).toBe("operational");
    expect(component(data, "contact").status).toBe("operational");
    expect(data.status).toBe("unknown");
  });

  test("turns Website network ambiguity into Unknown", async () => {
    const { data } = await getSystemStatus({
      fetchMock: vi.fn(async () => {
        throw new TypeError("private network detail");
      }),
    });

    expect(component(data, "website").status).toBe("unknown");
    expect(data.status).toBe("unknown");
  });

  test("bounds the Website response before marker matching", async () => {
    const { data } = await getSystemStatus({
      fetchMock: vi.fn(async () =>
        new Response(healthyHtml, {
          headers: {
            "Content-Type": "text/html",
            "Content-Length": String(SYSTEM_STATUS_WEBSITE_RESPONSE_MAX_BYTES + 1),
          },
        }),
      ),
    });

    expect(component(data, "website").status).toBe("unknown");
    expect(data.status).toBe("unknown");
  });

  test.each([
    [{ ...healthyEnv, TURNSTILE_SECRET_KEY: "" }, "missing configuration"],
    [{ ...healthyEnv, FORMSPREE_ENDPOINT: "http://formspree.example.test/f/x" }, "malformed configuration"],
  ])("keeps known components when Contact has %s", async (env) => {
    const { data } = await getSystemStatus({ env });

    expect(component(data, "website").status).toBe("operational");
    expect(component(data, "api").status).toBe("operational");
    expect(component(data, "contact").status).toBe("unknown");
    expect(data.status).toBe("unknown");
  });

  test("Contact health never calls Turnstile or Formspree", async () => {
    const fetchMock = vi.fn(async () => htmlResponse());
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      request("/api/contact/health"),
      healthyEnv,
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "contact",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("Contact health stays independent of malformed configuration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      request("/api/contact/health"),
      { ...healthyEnv, FORMSPREE_ENDPOINT: "not-a-url" },
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      service: "contact",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("API health returns only its service identity", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await worker.fetch(request("/api/health"), {}, context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      service: "huihui-api",
    });
  });

  test("rejects malformed API readiness payloads", () => {
    expect(
      normalizeApiReadinessPayload({
        ok: true,
        status: "operational",
        scope: "worker_request_path",
      }),
    ).toBe("operational");
    expect(normalizeApiReadinessPayload({ ok: true, status: "operational" })).toBe(
      "unknown",
    );
    expect(
      normalizeApiReadinessPayload({
        ok: true,
        status: "major_outage",
        scope: "worker_request_path",
      }),
    ).toBe("unknown");
  });

  test("aggregates conservatively and otherwise selects the worst known state", () => {
    expect(
      aggregateSystemStatus([
        { status: "operational" },
        { status: "unknown" },
        { status: "major_outage" },
      ]),
    ).toBe("unknown");
    expect(
      aggregateSystemStatus([
        { status: "operational" },
        { status: "degraded_performance" },
        { status: "partial_outage" },
      ]),
    ).toBe("partial_outage");
  });

  test.each(["/api/system-status", "/api/health", "/api/contact/health"])(
    "%s supports OPTIONS and rejects unsupported methods",
    async (path) => {
      vi.stubGlobal("fetch", vi.fn());
      const options = await worker.fetch(
        request(path, { method: "OPTIONS", headers: { Origin: productionOrigin } }),
        healthyEnv,
        context(),
      );
      const post = await worker.fetch(
        request(path, { method: "POST", headers: { Origin: productionOrigin } }),
        healthyEnv,
        context(),
      );

      expect(options.status).toBe(204);
      expect(options.headers.get("Allow")).toBe("GET, OPTIONS");
      expect(options.headers.get("Access-Control-Allow-Origin")).toBe(productionOrigin);
      expect(post.status).toBe(405);
      expect(post.headers.get("Allow")).toBe("GET, OPTIONS");
    },
  );

  test("does not reuse stale green data after a failed refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse())
      .mockRejectedValueOnce(new TypeError("second request failed"));
    const first = await getSystemStatus({ fetchMock });
    const second = await getSystemStatus({ fetchMock });

    expect(first.data.status).toBe("operational");
    expect(second.data.status).toBe("unknown");
    expect(second.response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("emits bounded diagnostics without endpoint or secret values", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const privateEndpoint = "https://private.example.test/form-id";
    const { data } = await getSystemStatus({
      env: {
        WORKER_ENV: "production",
        TURNSTILE_SECRET_KEY: "private-secret",
        FORMSPREE_ENDPOINT: privateEndpoint,
      },
      fetchMock: vi.fn(async () => new Response("failure", { status: 503 })),
    });
    const serialized = JSON.stringify([
      warnSpy.mock.calls,
      errorSpy.mock.calls,
      data,
    ]);

    expect(warnSpy).toHaveBeenCalledWith({
      event: "worker_upstream_failure",
      route: "/api/system-status",
      upstream: "system_website",
      category: "http_status",
      httpStatus: 503,
    });
    expect(serialized).not.toContain("private-secret");
    expect(serialized).not.toContain(privateEndpoint);
  });
});
