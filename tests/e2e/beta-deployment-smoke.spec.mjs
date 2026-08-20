import { expect, test } from "@playwright/test";

function monitorRuntime(page) {
  const pageErrors = [];
  const failedSameOriginResources = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === "https://beta.huihui.dev") {
      failedSameOriginResources.push(
        `${request.method()} ${request.url()}: ${request.failure()?.errorText || "failed"}`,
      );
    }
  });
  page.on("response", (response) => {
    if (
      new URL(response.url()).origin === "https://beta.huihui.dev" &&
      response.status() >= 400
    ) {
      failedSameOriginResources.push(
        `${response.request().method()} ${response.url()}: HTTP ${response.status()}`,
      );
    }
  });

  return () => {
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedSameOriginResources, "failed same-origin resources").toEqual([]);
  };
}

async function expectLocalizedShell(page, path, lang) {
  const assertCleanRuntime = monitorRuntime(page);
  const response = await page.goto(path, { waitUntil: "load" });

  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("main.main")).toBeVisible();
  await expect(page.locator("#site-sidebar nav")).toBeVisible();
  assertCleanRuntime();
}

test("Home reaches a deployed terminal state without runtime failures", async ({
  page,
}) => {
  const assertCleanRuntime = monitorRuntime(page);
  const response = await page.goto("/", { waitUntil: "load" });

  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page.locator("main.main")).toBeVisible();
  await expect(page.locator("#site-sidebar nav")).toBeVisible();
  await expect
    .poll(
      () =>
        page
          .locator(
            '#techNewsCards > .tech-news-card, #techNewsCards > .tech-news-status[data-tech-news-state="empty"], #techNewsCards > .tech-news-status[data-tech-news-state="error"], #techNewsCards > .tech-news-status[data-tech-news-state="timeout"]',
          )
          .count(),
      { timeout: 12_000 },
    )
    .toBeGreaterThan(0);
  assertCleanRuntime();
});

test("English Home has its localized deployed shell", async ({ page }) => {
  await expectLocalizedShell(page, "/en/", "en");
});

test("Japanese Home has its localized deployed shell", async ({ page }) => {
  await expectLocalizedShell(page, "/ja/", "ja");
});

test("About initializes content, Steam terminal state, and root scrollbar", async ({
  page,
}) => {
  const assertCleanRuntime = monitorRuntime(page);
  const response = await page.goto("/about/", { waitUntil: "load" });

  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "關於我" })).toBeVisible();
  await expect(page.locator(".os-scrollbar-vertical")).toBeVisible();
  await expect
    .poll(async () => {
      const cards = await page.locator("#steamFavorites > .steam-game-card").count();
      const error = await page.locator("#steamFavorites > .steam-error").count();
      return cards > 0 ? "cards" : error > 0 ? "error" : "loading";
    }, { timeout: 12_000 })
    .toMatch(/^(?:cards|error)$/);
  assertCleanRuntime();
});

test("Contact uses beta wiring and does not submit", async ({ page }) => {
  const assertCleanRuntime = monitorRuntime(page);
  let contactRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/contact")) contactRequests += 1;
  });

  const response = await page.goto("/contact/", { waitUntil: "load" });
  const form = page.locator("#contact-form");

  expect(response?.ok()).toBe(true);
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute(
    "action",
    "https://huihui-api-beta.huihuigames01.workers.dev/api/contact",
  );
  await expect(form.locator('.cf-turnstile[data-action="contact"]')).toHaveCount(1);
  await expect(form.locator("button[type='submit']")).toBeEnabled();
  await expect(page.locator("#contact-status")).toBeEmpty();
  expect(contactRequests).toBe(0);
  assertCleanRuntime();
});
