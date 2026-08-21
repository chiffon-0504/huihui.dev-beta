import { afterEach, describe, expect, test, vi } from "vitest";
import {
  assertBrowserCors,
  runLiveSmoke,
} from "../scripts/beta-http-smoke.mjs";

const betaOrigin = "https://beta.huihui.dev";
const apiBaseUrl = "https://huihui-api-beta.huihuigames01.workers.dev";
const techNewsEndpoint = `${apiBaseUrl}/api/tech-news`;
const steamEndpoint = `${apiBaseUrl}/api/steam-library`;
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
    headers: new Headers({
      "Access-Control-Allow-Origin": betaOrigin,
      "Content-Type": "application/json",
    }),
    json: async () => body,
  };
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
  test("requests exactly the two Worker APIs with the beta browser Origin", async () => {
    const fetchMock = vi.fn(async (url) =>
      url === techNewsEndpoint
        ? jsonResponse(url, { ok: true, techNews: [] })
        : jsonResponse(url, healthySteamBody),
    );
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
    ]);
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
  ])(
    "fails closed for %s",
    async (_label, invalidUrl, invalidResponse, error) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
          if (url === invalidUrl) return invalidResponse;
          if (url === techNewsEndpoint) {
            return jsonResponse(url, { ok: true, techNews: [] });
          }
          return jsonResponse(url, healthySteamBody);
        }),
      );

      await expect(runLiveSmoke()).rejects.toThrow(error);
    },
  );
});
