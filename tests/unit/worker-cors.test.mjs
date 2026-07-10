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
const betaOrigin = "https://beta.huihui.dev";

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
}

function expectRejected(response) {
  expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  expect(response.headers.has("Access-Control-Allow-Methods")).toBe(false);
  expect(response.headers.has("Access-Control-Allow-Headers")).toBe(false);
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

  test("rejects the beta origin in production", async () => {
    const response = await requestForEnvironment("/", betaOrigin, "production");

    expectRejected(response);
  });

  test("allows only the beta origin in beta", async () => {
    const allowedResponse = await requestForEnvironment("/", betaOrigin, "beta");
    const rejectedResponses = await Promise.all(
      productionOrigins.map((origin) =>
        requestForEnvironment("/", origin, "beta"),
      ),
    );

    expectAllowed(allowedResponse, betaOrigin);
    rejectedResponses.forEach(expectRejected);
  });

  test("rejects unlisted origins in every environment", async () => {
    const unlistedOrigin = "https://attacker.example";
    const responses = await Promise.all([
      requestForEnvironment("/", unlistedOrigin, "production"),
      requestForEnvironment("/", unlistedOrigin, "beta"),
    ]);

    responses.forEach(expectRejected);
  });

  test("unknown and missing environments fail safely as production", async () => {
    const unknownProduction = await requestForEnvironment(
      "/",
      productionOrigins[0],
      "preview",
    );
    const unknownBeta = await requestForEnvironment("/", betaOrigin, "preview");
    const missingProduction = await request("/", productionOrigins[0]);
    const missingBeta = await request("/", betaOrigin);

    expectAllowed(unknownProduction, productionOrigins[0]);
    expectRejected(unknownBeta);
    expectAllowed(missingProduction, productionOrigins[0]);
    expectRejected(missingBeta);
  });

  test("applies the same origin isolation to contact preflight", async () => {
    const productionAllowed = await requestForEnvironment(
      "/api/contact",
      productionOrigins[0],
      "production",
      "OPTIONS",
    );
    const productionRejected = await requestForEnvironment(
      "/api/contact",
      betaOrigin,
      "production",
      "OPTIONS",
    );
    const betaAllowed = await requestForEnvironment(
      "/api/contact",
      betaOrigin,
      "beta",
      "OPTIONS",
    );
    const betaRejected = await requestForEnvironment(
      "/api/contact",
      productionOrigins[0],
      "beta",
      "OPTIONS",
    );

    expect(productionAllowed.status).toBe(204);
    expectAllowed(productionAllowed, productionOrigins[0]);
    expectRejected(productionRejected);
    expectAllowed(betaAllowed, betaOrigin);
    expectRejected(betaRejected);
    expect(betaAllowed.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
    expect(betaAllowed.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type",
    );
  });

  test("replaces a legacy cached wildcard with the environment origin", async () => {
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
      betaOrigin,
      "beta",
    );

    expectAllowed(response, betaOrigin);
  });
});
