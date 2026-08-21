import { describe, expect, test } from "vitest";
import {
  BETA_SITE_ORIGIN,
  assertBetaPageOrigin,
  assertExactFinalUrl,
} from "../support/beta-origin.mjs";

describe("beta deployment final-origin contract", () => {
  test("accepts a beta route that remains on its requested URL", () => {
    expect(
      assertBetaPageOrigin(
        `${BETA_SITE_ORIGIN}/about/`,
        `${BETA_SITE_ORIGIN}/about/`,
      ).href,
    ).toBe(`${BETA_SITE_ORIGIN}/about/`);
  });

  test("accepts a valid same-origin redirect to another beta path", () => {
    expect(
      assertBetaPageOrigin(
        `${BETA_SITE_ORIGIN}/about`,
        `${BETA_SITE_ORIGIN}/about/`,
      ).href,
    ).toBe(`${BETA_SITE_ORIGIN}/about/`);
  });

  test.each([
    ["production", "https://huihui.dev/about/"],
    ["www production", "https://www.huihui.dev/about/"],
    ["Pages deployment", "https://example.huihuidev-beta.pages.dev/about/"],
  ])("rejects a redirect to the %s origin", (_label, finalUrl) => {
    const requestedUrl = `${BETA_SITE_ORIGIN}/about/`;

    expect(() => assertBetaPageOrigin(requestedUrl, finalUrl)).toThrow(
      new RegExp(
        `Requested ${requestedUrl} resolved to ${finalUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}; unexpected origin`,
      ),
    );
  });

  test("accepts a Chromium page ending on the beta origin", () => {
    expect(() =>
      assertBetaPageOrigin("/contact/", `${BETA_SITE_ORIGIN}/contact/`),
    ).not.toThrow();
  });

  test("rejects a Chromium page ending on another origin", () => {
    expect(() =>
      assertBetaPageOrigin("/contact/", "https://huihui.dev/contact/"),
    ).toThrow(/unexpected origin https:\/\/huihui\.dev/);
  });

  test("requires direct API responses to keep the exact canonical URL", () => {
    const endpoint =
      "https://huihui-api-beta.huihuigames01.workers.dev/api/tech-news";

    expect(() => assertExactFinalUrl(endpoint, endpoint)).not.toThrow();
    expect(() =>
      assertExactFinalUrl(endpoint, `${endpoint}/`),
    ).toThrow(/expected canonical URL/);
    expect(() =>
      assertExactFinalUrl(endpoint, "https://huihui.dev/api/tech-news"),
    ).toThrow(/unexpected origin https:\/\/huihui\.dev/);
  });
});
