import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "../../workers/huihui-api/worker.js";

const wranglerConfig = readFileSync(
  new URL("../../workers/huihui-api/wrangler.toml", import.meta.url),
  "utf8",
);
const productionOrigins = [
  "https://huihui.dev",
  "https://www.huihui.dev",
];
const betaOrigins = [
  "https://beta.huihui.dev",
  "https://huihuidev-beta.pages.dev",
  "https://5a827187.huihuidev-beta.pages.dev",
];
const rejectedBetaOrigins = [
  ...productionOrigins,
  "https://attacker.pages.dev",
  "https://evil-huihuidev-beta.pages.dev",
  "https://huihuidev-beta.pages.dev.evil.example",
  "http://beta.huihui.dev",
  "http://huihuidev-beta.pages.dev",
  "http://5a827187.huihuidev-beta.pages.dev",
  "https://beta.huihui.dev:8443",
  "https://5a827187.huihuidev-beta.pages.dev:8443",
  "https://user@beta.huihui.dev",
  "https://user:password@beta.huihui.dev",
  "https://beta.huihui.dev/path",
  "https://beta.huihui.dev?preview=1",
  "https://beta.huihui.dev#preview",
];

function request(path, origin, method = "GET") {
  return worker.fetch(
    new Request(`https://api.example.test${path}`, {
      method,
      headers: { Origin: origin },
    }),
    {},
    {},
  );
}

function requestForEnvironment(path, origin, workerEnvironment, method = "GET") {
  return worker.fetch(
    new Request(`https://api.example.test${path}`, {
      method,
      headers: { Origin: origin },
    }),
    { WORKER_ENV: workerEnvironment },
    {},
  );
}

function expectAllowed(response, origin) {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  expect(response.headers.get("Vary")?.toLowerCase()).toContain("origin");
}

function expectRejected(response) {
  expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  expect(response.headers.has("Access-Control-Allow-Methods")).toBe(false);
  expect(response.headers.has("Access-Control-Allow-Headers")).toBe(false);
  expect(response.headers.get("Vary")?.toLowerCase()).toContain("origin");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Worker environment CORS", () => {
  test("declares separate production and beta Worker environments", () => {
    expect(wranglerConfig).toMatch(/^name = "huihui-api"/m);
    expect(wranglerConfig).toMatch(
      /\[vars\]\s+WORKER_ENV = "production"/,
    );
    expect(wranglerConfig).toMatch(
      /\[env\.beta\]\s+name = "huihui-api-beta"\s+workers_dev = true/,
    );
    expect(wranglerConfig).toMatch(
      /\[env\.beta\.vars\]\s+WORKER_ENV = "beta"/,
    );
  });

  test.each(productionOrigins)(
    "allows %s for production JSON responses",
    async (origin) => {
      const response = await requestForEnvironment("/", origin, "production");

      expectAllowed(response, origin);
      expect(await response.json()).toMatchObject({
        ok: true,
        message: "huihui.dev API",
      });
    },
  );

  test.each(betaOrigins)("rejects %s in production", async (origin) => {
    const response = await requestForEnvironment("/", origin, "production");

    expectRejected(response);
  });

  test.each(betaOrigins)("allows %s in beta", async (origin) => {
    const response = await requestForEnvironment("/", origin, "beta");

    expectAllowed(response, origin);
  });

  test.each(rejectedBetaOrigins)("rejects %s in beta", async (origin) => {
    const response = await requestForEnvironment("/", origin, "beta");

    expectRejected(response);
  });

  test("rejects an unlisted origin in production", async () => {
    const response = await requestForEnvironment(
      "/",
      "https://attacker.example",
      "production",
    );

    expectRejected(response);
  });

  test("unknown and missing environments fail safely as production", async () => {
    const unknownProduction = await requestForEnvironment(
      "/",
      productionOrigins[0],
      "preview",
    );
    const unknownBeta = await requestForEnvironment(
      "/",
      betaOrigins[0],
      "preview",
    );
    const missingProduction = await request("/", productionOrigins[0]);
    const missingBeta = await request("/", betaOrigins[0]);

    expectAllowed(unknownProduction, productionOrigins[0]);
    expectRejected(unknownBeta);
    expectAllowed(missingProduction, productionOrigins[0]);
    expectRejected(missingBeta);
  });

  test.each(productionOrigins)(
    "allows %s for production contact preflight",
    async (origin) => {
      const response = await requestForEnvironment(
        "/api/contact",
        origin,
        "production",
        "OPTIONS",
      );

      expect(response.status).toBe(204);
      expectAllowed(response, origin);
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
      );
    },
  );

  test.each(betaOrigins)(
    "rejects %s for production contact preflight",
    async (origin) => {
      const response = await requestForEnvironment(
        "/api/contact",
        origin,
        "production",
        "OPTIONS",
      );

      expectRejected(response);
    },
  );

  test.each(betaOrigins)(
    "allows %s for beta contact preflight",
    async (origin) => {
      const response = await requestForEnvironment(
        "/api/contact",
        origin,
        "beta",
        "OPTIONS",
      );

      expect(response.status).toBe(204);
      expectAllowed(response, origin);
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
      );
    },
  );

  test.each(rejectedBetaOrigins)(
    "rejects %s for beta contact preflight",
    async (origin) => {
      const response = await requestForEnvironment(
        "/api/contact",
        origin,
        "beta",
        "OPTIONS",
      );

      expectRejected(response);
    },
  );

  test.each([betaOrigins[0], betaOrigins[2]])(
    "replaces a legacy cached wildcard with %s",
    async (origin) => {
      vi.stubGlobal("caches", {
        default: {
          match: vi.fn(async () =>
            new Response(JSON.stringify({ ok: true, techNews: [] }), {
              headers: { "Access-Control-Allow-Origin": "*" },
            }),
          ),
        },
      });

      const response = await requestForEnvironment(
        "/api/tech-news",
        origin,
        "beta",
      );

      expectAllowed(response, origin);
    },
  );
});
