import { expect, test } from "@playwright/test";
import { primaryRouteGroups, primaryRoutes } from "../support/routes.mjs";

const routeGroupsByKey = new Map(
  primaryRouteGroups.map((group) => [group.routeKey, group]),
);
const localeOrder = ["zh", "en", "ja"];
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
  await page.route("https://cdn.jsdelivr.net/**", async (route) => {
    const isStyle = route.request().resourceType() === "stylesheet";
    await route.fulfill({
      status: 200,
      contentType: isStyle ? "text/css" : "application/javascript",
      body: "",
    });
  });

  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );

  const apiResponse = (url) => {
    if (url.includes("/api/tech-news")) {
      return { ok: true, techNews: [] };
    }
    if (url.includes("/api/steam-library")) {
      return { ok: true, games: [] };
    }
    if (url.includes("/api/apod")) {
      return { ok: true };
    }
    if (url.includes("/api/github-updates")) {
      return { ok: true, updatedText: "", link: "/" };
    }
    return { ok: true };
  };

  for (const pattern of ["https://api.huihui.dev/**"]) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiResponse(route.request().url())),
      }),
    );
  }
}

for (const route of primaryRoutes) {
  test(`${route.url} loads its localized page shell`, async ({ page }) => {
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

    await stubExternalDependencies(page);
    const response = await page.goto(route.url, { waitUntil: "load" });
    await page.waitForTimeout(100);

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
    await expect(page.locator("main.main")).toHaveCount(1);
    await expect(page.locator("#site-sidebar .sidebar-top")).toHaveCount(1);

    const routeGroup = routeGroupsByKey.get(route.routeKey);
    const languageLinks = page.locator("#site-sidebar .lang-switch a");

    await expect(languageLinks).toHaveCount(localeOrder.length);
    for (const [index, locale] of localeOrder.entries()) {
      await expect(languageLinks.nth(index)).toHaveAttribute(
        "href",
        routeGroup.paths[locale],
      );
    }

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
        .locator(".works-showcase-grid > a.showcase-project-card")
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
});

test("missing routes return the standalone 404 page", async ({ page }) => {
  const response = await page.goto("/definitely-missing-route/");

  expect(response?.status()).toBe(404);
  await expect(page.locator(".error-card h1")).toHaveText("404");
});
