import { expect, test } from "@playwright/test";
import { primaryRouteGroups, primaryRoutes } from "../support/routes.mjs";

const routeGroupsByKey = new Map(
  primaryRouteGroups.map((group) => [group.routeKey, group]),
);
const localeOrder = ["zh", "en", "ja"];
const languageLinkLanguages = ["zh-Hant", "en", "ja"];
const skipLinkText = {
  zh: "跳至主要內容",
  en: "Skip to main content",
  ja: "メインコンテンツへ移動",
};
const contactPlaceholders = {
  zh: { name: "你的名稱", message: "想說的內容" },
  en: { name: "Your name", message: "Your message" },
  ja: { name: "お名前", message: "メッセージ内容" },
};
const worksProjectRoutes = [
  { worksRoute: "/works/", homeRoute: "/", lang: "zh-Hant" },
  { worksRoute: "/en/works/", homeRoute: "/en/", lang: "en" },
  { worksRoute: "/ja/works/", homeRoute: "/ja/", lang: "ja" },
];
const worksVerificationViewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

async function stubExternalDependencies(page) {
  const apiRequests = [];

  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );

  const apiResponse = (pathname) => {
    if (pathname === "/api/tech-news") {
      return { ok: true, techNews: [] };
    }
    if (pathname === "/api/infrastructure-status") {
      return { ok: true, providers: [] };
    }
    if (pathname === "/api/steam-library") {
      return { ok: true, games: [] };
    }
    return null;
  };

  await page.route("https://api.huihui.dev/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = apiResponse(pathname);

    apiRequests.push(pathname);
    return route.fulfill({
      status: body ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(body || { ok: false }),
    });
  });

  return apiRequests;
}

async function awaitRouteReady(page, route) {
  if (route.routeKey === "home") {
    await expect(
      page.locator(
        '#techNewsCards > .tech-news-status[data-tech-news-state="empty"]',
      ),
    ).toHaveCount(1);
    await expect(page.locator(".infrastructure-status-card")).toHaveCount(2);
    return;
  }

  if (route.routeKey === "about") {
    await expect(page.locator("#steamFavorites > .steam-empty")).toHaveCount(1);
    return;
  }

  await expect(page.locator("main.main")).toHaveCount(1);
}

for (const route of primaryRoutes) {
  test(`${route.url} loads its localized page shell`, async ({
    browserName,
    page,
  }) => {
    const consoleErrors = [];
    const localFailures = [];
    const pageErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (
        url.origin === "http://127.0.0.1:4173" &&
        url.pathname !== "/favicon.ico" &&
        response.status() >= 400
      ) {
        localFailures.push(`${response.status()} ${url.pathname}`);
      }
    });
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      if (
        url.origin === "http://127.0.0.1:4173" &&
        url.pathname !== "/favicon.ico"
      ) {
        localFailures.push(`FAILED ${url.pathname}`);
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const apiRequests = await stubExternalDependencies(page);
    const response = await page.goto(route.url, { waitUntil: "load" });
    await awaitRouteReady(page, route);

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
    const main = page.locator("main.main");
    const skipLink = page.locator("a.skip-link");

    await expect(main).toHaveCount(1);
    await expect(main).toHaveAttribute("id", "main-content");
    await expect(main).toHaveAttribute("tabindex", "-1");
    await expect(page.locator("#main-content")).toHaveCount(1);
    await expect(skipLink).toHaveCount(1);
    await expect(skipLink).toHaveAttribute("href", "#main-content");
    await expect(skipLink).toHaveText(skipLinkText[route.locale]);
    expect(await skipLink.evaluate((element) => element.tabIndex)).toBe(0);
    await expect(page.locator("#site-sidebar .sidebar-top")).toHaveCount(1);

    if (browserName === "webkit") {
      // Bundled WebKit excludes ordinary anchors from its plain-Tab sequence.
      // Signal keyboard modality before explicit focus; this does not emulate
      // Safari's anchor navigation but preserves the visibility contract.
      await page.evaluate(() =>
        document.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
        ),
      );
      await skipLink.focus();
    } else {
      // Chromium and Firefox retain native plain-Tab sequential navigation.
      await page.keyboard.press("Tab");
    }
    await expect(skipLink).toBeFocused();
    const skipLinkFocus = await skipLink.evaluate((link) => {
      const style = getComputedStyle(link);
      const rect = link.getBoundingClientRect();

      return {
        bottom: rect.bottom,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        top: rect.top,
      };
    });
    expect(skipLinkFocus.top).toBeGreaterThanOrEqual(0);
    expect(skipLinkFocus.bottom).toBeGreaterThan(skipLinkFocus.top);
    expect(skipLinkFocus.outlineStyle).not.toBe("none");
    expect(skipLinkFocus.outlineWidth).not.toBe("0px");

    await page.keyboard.press("Enter");
    await expect(main).toBeFocused();
    expect(new URL(page.url()).hash).toBe("#main-content");

    const routeGroup = routeGroupsByKey.get(route.routeKey);
    const languageLinks = page.locator("#site-sidebar .lang-switch a");

    await expect(languageLinks).toHaveCount(localeOrder.length);
    for (const [index, locale] of localeOrder.entries()) {
      await expect(languageLinks.nth(index)).toHaveAttribute(
        "href",
        routeGroup.paths[locale],
      );
      await expect(languageLinks.nth(index)).toHaveAttribute(
        "lang",
        languageLinkLanguages[index],
      );
    }

    const duplicateIds = await page.locator("[id]").evaluateAll((elements) => {
      const ids = elements.map((element) => element.id);
      return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    });
    expect(duplicateIds).toEqual([]);

    await expect(
      page.locator('#site-sidebar nav a[data-nav="works"]'),
    ).toHaveAttribute("href", routeGroupsByKey.get("works").paths[route.locale]);

    const currentPrimaryLinks = page.locator(
      '#site-sidebar nav a[aria-current="page"]',
    );
    const activePrimaryLinks = page.locator("#site-sidebar nav a.active");

    if (route.navKey) {
      await expect(currentPrimaryLinks).toHaveCount(1);
      await expect(activePrimaryLinks).toHaveCount(1);
      await expect(currentPrimaryLinks).toHaveClass(/\bactive\b/);
      await expect(currentPrimaryLinks).toHaveAttribute("data-nav", route.navKey);
    } else {
      await expect(currentPrimaryLinks).toHaveCount(0);
      await expect(activePrimaryLinks).toHaveCount(0);
    }

    if (route.routeKey === "contact") {
      await expect(page.locator('[name="name"]')).toHaveAttribute(
        "placeholder",
        contactPlaceholders[route.locale].name,
      );
      await expect(page.locator('[name="message"]')).toHaveAttribute(
        "placeholder",
        contactPlaceholders[route.locale].message,
      );
    }

    const expectedApiRequests = route.routeKey === "home"
      ? ["/api/tech-news", "/api/infrastructure-status"]
      : route.routeKey === "about"
        ? ["/api/steam-library"]
        : [];
    expect(apiRequests).toEqual(expectedApiRequests);

    expect(consoleErrors).toEqual([]);
    expect(localFailures).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test("localized Works project cards preserve locale with keyboard navigation", async ({
  browser,
}) => {
  for (const worksProjectRoute of worksProjectRoutes) {
    for (const viewport of worksVerificationViewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      await stubExternalDependencies(page);
      const response = await page.goto(worksProjectRoute.worksRoute, {
        waitUntil: "load",
      });
      const firstProjectCard = page
        .locator(".showcase-card-large .showcase-card-info")
        .first();
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        worksProjectRoute.lang,
      );
      await expect(firstProjectCard).toHaveAttribute(
        "href",
        worksProjectRoute.homeRoute,
      );
      expect(await firstProjectCard.getAttribute("target")).toBeNull();
      expect(await firstProjectCard.getAttribute("rel")).toBeNull();
      expect(await firstProjectCard.evaluate((element) => element.tabIndex)).toBe(
        0,
      );

      await firstProjectCard.focus();
      await expect(firstProjectCard).toBeFocused();
      await Promise.all([
        page.waitForURL(
          (url) => url.pathname === worksProjectRoute.homeRoute,
        ),
        page.keyboard.press("Enter"),
      ]);

      expect(new URL(page.url()).pathname).toBe(worksProjectRoute.homeRoute);
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        worksProjectRoute.lang,
      );

      await page.goBack({ waitUntil: "load" });

      expect(new URL(page.url()).pathname).toBe(worksProjectRoute.worksRoute);
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        worksProjectRoute.lang,
      );
      await expect(firstProjectCard).toHaveAttribute(
        "href",
        worksProjectRoute.homeRoute,
      );
      await context.close();
    }
  }
});

test("the standalone 114514 route loads", async ({ page }) => {
  const response = await page.goto("/114514/");

  expect(response?.status()).toBe(200);
  await expect(page.locator(".error-card h1")).toHaveText("114514");
  await expect(page.locator(".skip-link, #main-content")).toHaveCount(0);
});

test("missing routes return the standalone 404 page", async ({ page }) => {
  const response = await page.goto("/definitely-missing-route/");

  expect(response?.status()).toBe(404);
  await expect(page.locator(".error-card h1")).toHaveText("404");
  await expect(page.locator(".skip-link, #main-content")).toHaveCount(0);
});
