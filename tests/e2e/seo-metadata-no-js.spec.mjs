import { expect, test } from "@playwright/test";
import { primaryRoutes } from "../support/routes.mjs";
import { getExpectedSeoMetadata } from "../support/seo-metadata.mjs";

test.use({ javaScriptEnabled: false });

function observePage(page) {
  const observations = {
    consoleErrors: [],
    localFailures: [],
    pageErrors: [],
    productionRequests: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      observations.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => observations.pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "huihui.dev" || url.hostname === "api.huihui.dev") {
      observations.productionRequests.push(request.url());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === "http://127.0.0.1:4173" &&
      url.pathname !== "/favicon.ico" &&
      response.status() >= 400
    ) {
      observations.localFailures.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === "http://127.0.0.1:4173" &&
      url.pathname !== "/favicon.ico"
    ) {
      observations.localFailures.push(`FAILED ${url.pathname}`);
    }
  });

  return observations;
}

for (const route of primaryRoutes) {
  test(`${route.url} exposes static SEO metadata without JavaScript`, async ({
    page,
  }) => {
    const observations = observePage(page);
    const expected = getExpectedSeoMetadata(route);
    const response = await page.goto(route.url, { waitUntil: "load" });
    const canonical = page.locator('head > link[rel="canonical"]');
    const alternates = page.locator(
      'head > link[rel="alternate"][hreflang]',
    );

    expect(response?.status(), route.url).toBe(200);
    expect(new URL(page.url()).hostname, route.url).toBe("127.0.0.1");
    await expect(page.locator("html"), route.url).toHaveAttribute(
      "lang",
      route.lang,
    );
    await expect(canonical, route.url).toHaveCount(1);
    await expect(alternates, route.url).toHaveCount(4);
    expect(await canonical.getAttribute("href"), route.url).toBe(
      expected.canonical,
    );

    const alternateMap = {};
    for (let index = 0; index < 4; index += 1) {
      const alternate = alternates.nth(index);
      const hreflang = await alternate.getAttribute("hreflang");
      const href = await alternate.getAttribute("href");
      alternateMap[hreflang] = href;
    }

    expect(alternateMap, route.url).toEqual(
      Object.fromEntries(
        expected.alternates.map(({ hreflang, href }) => [hreflang, href]),
      ),
    );
    expect(observations.consoleErrors, route.url).toEqual([]);
    expect(observations.pageErrors, route.url).toEqual([]);
    expect(observations.localFailures, route.url).toEqual([]);
    expect(observations.productionRequests, route.url).toEqual([]);
  });
}
