import { expect, test } from "@playwright/test";
import { assertBetaPageOrigin } from "../support/beta-origin.mjs";
import {
  classifySteamResponse,
  isSteamUiStateAllowed,
} from "../support/steam-contract.mjs";
import { isTurnstileFrameUrl } from "../support/turnstile-frame.mjs";

const TURNSTILE_RENDER_TIMEOUT_MS = 15_000;
const TECH_NEWS_RESPONSE_TIMEOUT_MS = 15_000;
const STEAM_RESPONSE_TIMEOUT_MS = 15_000;
const TECH_NEWS_SUCCESS_SELECTOR =
  '#techNewsCards > .tech-news-card, #techNewsCards > .tech-news-status[data-tech-news-state="empty"]';
const TECH_NEWS_FAILURE_SELECTOR =
  '#techNewsCards > .tech-news-status[data-tech-news-state="error"], #techNewsCards > .tech-news-status[data-tech-news-state="timeout"]';
async function getSteamUiState(page) {
  const counts = await page.locator("#steamFavorites").evaluate((container) => ({
    cards: container.querySelectorAll(":scope > .steam-game-card").length,
    empty: container.querySelectorAll(":scope > .steam-empty").length,
    error: container.querySelectorAll(":scope > .steam-error").length,
    loading: container.querySelectorAll(":scope > .steam-loading").length,
  }));
  const terminalStates = ["cards", "empty", "error"].filter(
    (state) => counts[state] > 0,
  );

  if (counts.loading > 0) return "loading";
  return terminalStates.length === 1 ? terminalStates[0] : "invalid";
}

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

  assertBetaPageOrigin(path, page.url());
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
  const techNewsResponsePromise = page.waitForResponse(
    (candidate) => {
      const url = new URL(candidate.url());
      return (
        candidate.request().resourceType() === "fetch" &&
        url.pathname === "/api/tech-news"
      );
    },
    { timeout: TECH_NEWS_RESPONSE_TIMEOUT_MS },
  );
  const response = await page.goto("/", { waitUntil: "load" });

  assertBetaPageOrigin("/", page.url());
  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page.locator("main.main")).toBeVisible();
  await expect(page.locator("#site-sidebar nav")).toBeVisible();
  const expectedTechNewsUrl = await page.evaluate(
    () => `${getHuihuiApiBase(window.location.hostname)}/api/tech-news`,
  );
  const techNewsResponse = await techNewsResponsePromise;
  const techNewsContentType = techNewsResponse.headers()["content-type"] || "";

  expect(techNewsResponse.url()).toBe(expectedTechNewsUrl);
  expect(techNewsResponse.ok()).toBe(true);
  expect(techNewsContentType).toMatch(/^application\/json\b/i);

  const techNewsBody = await techNewsResponse.json();
  expect(techNewsBody).toMatchObject({ ok: true });
  expect(Array.isArray(techNewsBody.techNews)).toBe(true);

  await expect
    .poll(
      () => page.locator(TECH_NEWS_SUCCESS_SELECTOR).count(),
      { timeout: 12_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.locator(TECH_NEWS_FAILURE_SELECTOR)).toHaveCount(0);
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
  const steamResponsePromise = page.waitForResponse(
    (candidate) => {
      const url = new URL(candidate.url());
      return (
        candidate.request().resourceType() === "fetch" &&
        url.pathname === "/api/steam-library"
      );
    },
    { timeout: STEAM_RESPONSE_TIMEOUT_MS },
  );
  const response = await page.goto("/about/", { waitUntil: "load" });

  assertBetaPageOrigin("/about/", page.url());
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "關於我" })).toBeVisible();
  await expect(page.locator(".os-scrollbar-vertical")).toBeVisible();
  const expectedSteamUrl = await page.evaluate(
    () => `${getHuihuiApiBase(window.location.hostname)}/api/steam-library`,
  );
  const steamResponse = await steamResponsePromise;
  const steamContentType = steamResponse.headers()["content-type"] || "";

  expect(steamResponse.url()).toBe(expectedSteamUrl);
  expect(steamContentType).toMatch(/^application\/json\b/i);

  const steamBody = await steamResponse.json();
  const steamResponseFamily = classifySteamResponse(
    steamResponse.status(),
    steamBody,
  );

  expect(steamResponseFamily).not.toBeNull();

  await expect
    .poll(async () => {
      const uiState = await getSteamUiState(page);
      return isSteamUiStateAllowed(steamResponseFamily, uiState);
    }, {
      timeout: 12_000,
    })
    .toBe(true);
  assertCleanRuntime();
});

test("Contact uses beta wiring and does not submit", async ({ page }) => {
  test.setTimeout(60_000);
  const assertCleanRuntime = monitorRuntime(page);
  let contactRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/contact")) contactRequests += 1;
  });

  const response = await page.goto("/contact/", { waitUntil: "load" });
  const form = page.locator("#contact-form");

  assertBetaPageOrigin("/contact/", page.url());
  expect(response?.ok()).toBe(true);
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute(
    "action",
    "https://huihui-api-beta.huihuigames01.workers.dev/api/contact",
  );
  await expect(form.locator('.cf-turnstile[data-action="contact"]')).toHaveCount(1);
  await expect
    .poll(
      () => page.frames().some((frame) => isTurnstileFrameUrl(frame.url())),
      {
        message: "Cloudflare Turnstile challenge frame did not render",
        timeout: TURNSTILE_RENDER_TIMEOUT_MS,
      },
    )
    .toBe(true);
  await expect(
    form.locator('input[name="cf-turnstile-response"]'),
  ).toHaveCount(1, { timeout: TURNSTILE_RENDER_TIMEOUT_MS });
  await expect(form.locator("button[type='submit']")).toBeEnabled();
  await expect(page.locator("#contact-status")).toBeEmpty();
  expect(contactRequests).toBe(0);
  assertCleanRuntime();
});
