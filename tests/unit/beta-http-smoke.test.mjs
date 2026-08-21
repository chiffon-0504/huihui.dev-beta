import { describe, expect, test } from "vitest";
import { assertBrowserCors } from "../scripts/beta-http-smoke.mjs";

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
