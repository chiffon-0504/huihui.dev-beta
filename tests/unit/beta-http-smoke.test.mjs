import { describe, expect, test } from "vitest";
import {
  assertBrowserCors,
  assertPageResponseOk,
  pageContracts,
} from "../scripts/beta-http-smoke.mjs";

const endpoint =
  "https://huihui-api-beta.huihuigames01.workers.dev/api/tech-news";

describe("Beta HTTP smoke CORS assertion", () => {
  test("accepts the exact browser-visible beta origin", () => {
    const response = new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "https://beta.huihui.dev",
      },
    });

    expect(() => assertBrowserCors(response, endpoint)).not.toThrow();
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

    expect(() => assertBrowserCors(response, endpoint)).toThrow(
      /expected https:\/\/beta\.huihui\.dev/,
    );
  });
});

describe("Beta HTTP page smoke layering", () => {
  test("owns only ordinary static routes", () => {
    expect(pageContracts.map(({ path }) => path)).toEqual([
      "/",
      "/en/",
      "/ja/",
      "/about/",
    ]);
    expect(pageContracts.some(({ path }) => path === "/contact/")).toBe(false);
  });

  test("fails closed with only safe response metadata", () => {
    const response = new Response("sensitive response body", {
      status: 403,
      headers: {
        "cf-ray": "abc123-TPE",
        "cf-mitigated": "challenge",
        server: "cloudflare",
        "content-type": "text/html; charset=UTF-8",
        "set-cookie": "secret=value",
      },
    });

    expect(() =>
      assertPageResponseOk(response, "https://beta.huihui.dev/about/"),
    ).toThrowError(
      "https://beta.huihui.dev/about/ returned HTTP 403 " +
        "(cf-ray=abc123-TPE, cf-mitigated=challenge, server=cloudflare, " +
        "content-type=text/html; charset=UTF-8)",
    );

    try {
      assertPageResponseOk(response, "https://beta.huihui.dev/about/");
    } catch (error) {
      expect(error.message).not.toContain("sensitive response body");
      expect(error.message).not.toContain("secret=value");
    }
  });
});
