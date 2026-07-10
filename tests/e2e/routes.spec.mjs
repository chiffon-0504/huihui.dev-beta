import { expect, test } from "@playwright/test";
import { primaryRoutes } from "../support/routes.mjs";

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

  for (const pattern of [
    "https://api.huihui.dev/**",
    "https://huihui-api.huihuigames01.workers.dev/**",
  ]) {
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
    expect(consoleErrors).toEqual([]);
    expect(localFailures).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

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
