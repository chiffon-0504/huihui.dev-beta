import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import worker, {
  INFRASTRUCTURE_STATUS_PROVIDER_DEADLINE_MS,
  INFRASTRUCTURE_STATUS_RESPONSE_MAX_BYTES,
} from "../../workers/huihui-api/worker.js";

const endpoint = "https://api.example.test/api/infrastructure-status";
const cloudflareUrl =
  "https://www.cloudflarestatus.com/api/v2/summary.json";
const githubUrl = "https://www.githubstatus.com/api/v2/summary.json";
const cloudflarePageId = "yh6f0r4529hb";

function summary(name, components, indicator = "none", pageId = "private-statuspage-id") {
  return {
    page: { id: pageId, name },
    components,
    incidents: [{ body: "private incident fixture" }],
    status: { indicator },
  };
}

function cloudflareSummary(
  statuses = {},
  extraComponents = [],
  page = { id: cloudflarePageId, name: "Cloudflare Status" },
) {
  return summary(
    page.name,
    [
      { id: "cf-pages", name: "Pages", status: statuses.pages || "operational" },
      { id: "cf-workers", name: "Workers", status: statuses.workers || "operational" },
      {
        id: "cf-dns",
        name: "Authoritative DNS",
        status: statuses.dns || "operational",
      },
      { id: "cf-cdn", name: "CDN/Cache", status: statuses.cdn || "operational" },
      ...extraComponents,
    ],
    statuses.indicator || "none",
    page.id,
  );
}

function githubSummary(statuses = {}, extraComponents = []) {
  return summary("GitHub", [
    {
      id: "gh-git",
      name: "Git Operations",
      status: statuses.gitOperations || "operational",
    },
    {
      id: "gh-api",
      name: "API Requests",
      status: statuses.apiRequests || "operational",
    },
    { id: "gh-actions", name: "Actions", status: statuses.actions || "operational" },
    ...extraComponents,
  ]);
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createFetch({
  cloudflare = cloudflareSummary(),
  github = githubSummary(),
} = {}) {
  return vi.fn(async (url, init) => {
    const value = url === cloudflareUrl ? cloudflare : github;

    if (url !== cloudflareUrl && url !== githubUrl) {
      throw new Error("Unexpected upstream URL");
    }

    if (typeof value === "function") return value(init);
    if (value instanceof Error) throw value;
    if (value instanceof Response) return value;
    return jsonResponse(value);
  });
}

function stubCache(matchImplementation = async () => undefined) {
  const match = vi.fn(matchImplementation);
  const put = vi.fn(async () => undefined);

  vi.stubGlobal("caches", { default: { match, put } });
  return { match, put };
}

async function requestInfrastructure({
  fetchMock = createFetch(),
  matchImplementation,
  headers,
  method = "GET",
} = {}) {
  const pendingTasks = [];
  const cache = stubCache(matchImplementation);
  vi.stubGlobal("fetch", fetchMock);

  const response = await worker.fetch(
    new Request(endpoint, { method, headers }),
    { WORKER_ENV: "production" },
    {
      waitUntil(task) {
        pendingTasks.push(task);
      },
    },
  );

  await Promise.all(pendingTasks);
  return { cache, fetchMock, response };
}

function provider(data, id) {
  return data.providers.find((candidate) => candidate.id === id);
}

let warnSpy;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Infrastructure Status Worker", () => {
  test("accepts the current Cloudflare display name when the stable page id matches", async () => {
    const { response } = await requestInfrastructure();
    const data = await response.json();
    const cloudflare = provider(data, "cloudflare");

    expect(cloudflare.status).toBe("operational");
    expect(cloudflare.components.every((component) => component.status === "operational")).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("accepts future Cloudflare display-name changes when the stable page id matches", async () => {
    const { response } = await requestInfrastructure({
      fetchMock: createFetch({
        cloudflare: cloudflareSummary({}, [], {
          id: cloudflarePageId,
          name: "Cloudflare Network Status",
        }),
      }),
    });
    const data = await response.json();

    expect(provider(data, "cloudflare").status).toBe("operational");
    expect(provider(data, "github").status).toBe("operational");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("rejects a Cloudflare payload with the wrong page id", async () => {
    const { cache, response } = await requestInfrastructure({
      fetchMock: createFetch({
        cloudflare: cloudflareSummary({}, [], {
          id: "wrong-statuspage-id",
          name: "Cloudflare",
        }),
      }),
    });
    const data = await response.json();

    expect(provider(data, "cloudflare").status).toBe("unknown");
    expect(provider(data, "github").status).toBe("operational");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(cache.put).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith({
      event: "worker_upstream_failure",
      route: "/api/infrastructure-status",
      upstream: "cloudflare_status",
      category: "invalid_response",
    });
  });

  test.each([
    ["missing", undefined],
    ["invalid", "not-an-array"],
  ])("rejects a Cloudflare payload with a %s components array", async (_label, components) => {
    const fixture = cloudflareSummary();
    if (components === undefined) delete fixture.components;
    else fixture.components = components;

    const { response } = await requestInfrastructure({
      fetchMock: createFetch({ cloudflare: fixture }),
    });
    const data = await response.json();

    expect(provider(data, "cloudflare").status).toBe("unknown");
    expect(provider(data, "github").status).toBe("operational");
    expect(warnSpy).toHaveBeenCalledWith({
      event: "worker_upstream_failure",
      route: "/api/infrastructure-status",
      upstream: "cloudflare_status",
      category: "invalid_response",
    });
  });

  test("normalizes only the exact relevant components and caches a complete result for 60 seconds", async () => {
    const fetchMock = createFetch({
      cloudflare: cloudflareSummary(
        { indicator: "minor" },
        [{ id: "cf-unrelated", name: "Data Center X", status: "major_outage" }],
      ),
      github: githubSummary({}, [
        { id: "gh-pages", name: "Pages", status: "partial_outage" },
      ]),
    });
    const { cache, response } = await requestInfrastructure({ fetchMock });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(response.headers.get("X-Cache")).toBe("MISS");
    expect(data).toEqual({
      ok: true,
      providers: [
        {
          id: "cloudflare",
          name: "Cloudflare",
          status: "operational",
          url: "https://www.cloudflarestatus.com/",
          components: [
            { id: "pages", name: "Pages", status: "operational" },
            { id: "workers", name: "Workers", status: "operational" },
            { id: "dns", name: "DNS", status: "operational" },
            { id: "cdn", name: "CDN", status: "operational" },
          ],
        },
        {
          id: "github",
          name: "GitHub",
          status: "operational",
          url: "https://www.githubstatus.com/",
          components: [
            { id: "actions", name: "Actions", status: "operational" },
            { id: "api_requests", name: "API Requests", status: "operational" },
            { id: "git_operations", name: "Git Operations", status: "operational" },
          ],
        },
      ],
    });
    expect(JSON.stringify(data)).not.toContain("private-statuspage-id");
    expect(JSON.stringify(data)).not.toContain(cloudflarePageId);
    expect(JSON.stringify(data)).not.toContain("private incident fixture");
    expect(cache.put).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test.each([
    ["Cloudflare degraded component", { workers: "degraded_performance" }, {}, "cloudflare", "degraded_performance"],
    ["GitHub degraded component", {}, { actions: "degraded_performance" }, "github", "degraded_performance"],
    ["partial outage", { pages: "partial_outage" }, {}, "cloudflare", "partial_outage"],
    ["major outage", {}, { apiRequests: "major_outage" }, "github", "major_outage"],
  ])(
    "aggregates %s from the selected components",
    async (_label, cloudflareStatuses, githubStatuses, providerId, expected) => {
      const { response } = await requestInfrastructure({
        fetchMock: createFetch({
          cloudflare: cloudflareSummary(cloudflareStatuses),
          github: githubSummary(githubStatuses),
        }),
      });
      const data = await response.json();

      expect(provider(data, providerId).status).toBe(expected);
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    },
  );

  test("normalizes maintenance as a complete cacheable provider state", async () => {
    const { cache, response } = await requestInfrastructure({
      fetchMock: createFetch({
        cloudflare: cloudflareSummary({ workers: "under_maintenance" }),
      }),
    });
    const data = await response.json();
    const cloudflare = provider(data, "cloudflare");

    expect(cloudflare.status).toBe("under_maintenance");
    expect(cloudflare.components).toContainEqual({
      id: "workers",
      name: "Workers",
      status: "under_maintenance",
    });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(response.headers.get("X-Cache")).toBe("MISS");
    expect(cache.put).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("ranks degraded performance above maintenance in a mixed provider", async () => {
    const { response } = await requestInfrastructure({
      fetchMock: createFetch({
        cloudflare: cloudflareSummary({
          pages: "under_maintenance",
          workers: "degraded_performance",
        }),
      }),
    });
    const data = await response.json();

    expect(provider(data, "cloudflare").status).toBe("degraded_performance");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  test("uses major > partial > degraded > maintenance > operational aggregation precedence", async () => {
    const { response } = await requestInfrastructure({
      fetchMock: createFetch({
        cloudflare: cloudflareSummary({
          pages: "under_maintenance",
          workers: "partial_outage",
          dns: "major_outage",
        }),
      }),
    });
    const data = await response.json();

    expect(provider(data, "cloudflare").status).toBe("major_outage");
  });

  test.each([
    ["missing required component", cloudflareSummary(), "CDN/Cache"],
    ["unrecognized component status", cloudflareSummary({ workers: "maintenance" }), null],
  ])("fails closed for a %s", async (_label, fixture, removedName) => {
    if (removedName) {
      fixture.components = fixture.components.filter(
        (component) => component.name !== removedName,
      );
    }

    const { cache, response } = await requestInfrastructure({
      fetchMock: createFetch({ cloudflare: fixture }),
    });
    const data = await response.json();
    const cloudflare = provider(data, "cloudflare");

    expect(cloudflare.status).toBe("unknown");
    expect(cloudflare.components.some((component) => component.status === "unknown")).toBe(true);
    expect(provider(data, "github").status).toBe("operational");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Cache")).toBe("BYPASS");
    expect(cache.put).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith({
      event: "worker_upstream_failure",
      route: "/api/infrastructure-status",
      upstream: "cloudflare_status",
      category: "invalid_response",
    });
  });

  test.each([
    [
      "HTTP failure",
      new Response("unavailable", { status: 503 }),
      { category: "http_status", httpStatus: 503 },
    ],
    [
      "invalid JSON",
      new Response("{invalid", { headers: { "Content-Type": "application/json" } }),
      { category: "parse" },
    ],
    [
      "oversized response",
      new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(INFRASTRUCTURE_STATUS_RESPONSE_MAX_BYTES + 1),
        },
      }),
      { category: "size_limit" },
    ],
    ["network failure", new Error("private network marker"), { category: "network" }],
  ])("keeps GitHub real when Cloudflare has an %s", async (_label, failure, expectedLog) => {
    const { response } = await requestInfrastructure({
      fetchMock: createFetch({ cloudflare: failure }),
    });
    const responseText = await response.text();
    const data = JSON.parse(responseText);

    expect(provider(data, "cloudflare").status).toBe("unknown");
    expect(provider(data, "github").status).toBe("operational");
    expect(responseText).not.toContain("private network marker");
    expect(warnSpy).toHaveBeenCalledWith({
      event: "worker_upstream_failure",
      route: "/api/infrastructure-status",
      upstream: "cloudflare_status",
      ...expectedLog,
    });
  });

  test("times out one provider without blocking the other", async () => {
    vi.useFakeTimers();
    const cloudflare = ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    const pending = requestInfrastructure({
      fetchMock: createFetch({ cloudflare }),
    });

    await vi.advanceTimersByTimeAsync(INFRASTRUCTURE_STATUS_PROVIDER_DEADLINE_MS);
    const { response } = await pending;
    const data = await response.json();

    expect(provider(data, "cloudflare").status).toBe("unknown");
    expect(provider(data, "github").status).toBe("operational");
    expect(warnSpy).toHaveBeenCalledWith({
      event: "worker_upstream_failure",
      route: "/api/infrastructure-status",
      upstream: "cloudflare_status",
      category: "timeout",
    });
  });

  test("keeps Cloudflare real when the GitHub provider schema is malformed", async () => {
    const { response } = await requestInfrastructure({
      fetchMock: createFetch({
        github: { page: { name: "GitHub" }, components: "not-an-array" },
      }),
    });
    const data = await response.json();

    expect(provider(data, "cloudflare").status).toBe("operational");
    expect(provider(data, "github").status).toBe("unknown");
    expect(warnSpy).toHaveBeenCalledWith({
      event: "worker_upstream_failure",
      route: "/api/infrastructure-status",
      upstream: "github_status",
      category: "invalid_response",
    });
  });

  test("starts both official provider requests in parallel", async () => {
    const resolvers = new Map();
    const fetchMock = vi.fn(
      (url) =>
        new Promise((resolve) => {
          resolvers.set(url, resolve);
        }),
    );
    const pending = requestInfrastructure({ fetchMock });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolvers.get(cloudflareUrl)(jsonResponse(cloudflareSummary()));
    resolvers.get(githubUrl)(jsonResponse(githubSummary()));

    const { response } = await pending;
    expect(response.status).toBe(200);
  });

  test("uses a fresh cache hit and turns an expired cache plus failure into Unknown", async () => {
    const cachedPayload = {
      ok: true,
      providers: [
        {
          id: "cloudflare",
          name: "Cloudflare",
          status: "operational",
          url: "https://www.cloudflarestatus.com/",
          components: [],
        },
      ],
    };
    const match = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(cachedPayload, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
          },
        }),
      )
      .mockResolvedValueOnce(undefined);
    const fetchMock = createFetch({
      cloudflare: new Error("expired upstream failure"),
    });

    const first = await requestInfrastructure({
      fetchMock,
      matchImplementation: match,
    });
    expect(first.response.headers.get("X-Cache")).toBe("HIT");
    expect(fetchMock).not.toHaveBeenCalled();

    const second = await requestInfrastructure({
      fetchMock,
      matchImplementation: match,
    });
    const secondData = await second.response.json();

    expect(provider(secondData, "cloudflare").status).toBe("unknown");
    expect(second.response.headers.get("Cache-Control")).toBe("no-store");
    expect(second.cache.put).not.toHaveBeenCalled();
  });

  test("preserves the read-only CORS contract", async () => {
    const { response } = await requestInfrastructure({
      headers: { Origin: "https://huihui.dev" },
      matchImplementation: async () =>
        jsonResponse({ ok: true, providers: [] }, {
          headers: { "Access-Control-Allow-Origin": "*" },
        }),
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://huihui.dev",
    );
    expect(response.headers.get("Vary")?.toLowerCase()).toContain("origin");
  });
});
