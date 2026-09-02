import { expect, test } from "@playwright/test";
import { systemStatusFixture, systemStatusHistoryFixture, systemStatusIncidentsFixture } from "../support/system-status.mjs";

const localOrigin = "http://127.0.0.1:4173";
const apiOrigins = [
  "https://api.huihui.dev",
  "https://huihui-api-beta.huihuigames01.workers.dev",
];
const stubbedExternalOrigins = new Set([
  ...apiOrigins,
  "https://challenges.cloudflare.com",
]);
const mobileViewport = { width: 390, height: 844 };
const drawerFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]",
].join(",");
const imageBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const homeLocales = [
  { name: "zh-Hant", route: "/", lang: "zh-Hant" },
  { name: "English", route: "/en/", lang: "en" },
  { name: "Japanese", route: "/ja/", lang: "ja" },
];

function observePage(page) {
  const diagnostics = {
    consoleErrors: [],
    localFailures: [],
    pageErrors: [],
    unexpectedExternalRequests: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());

    if (
      url.origin !== localOrigin &&
      !stubbedExternalOrigins.has(url.origin) &&
      !["blob:", "data:"].includes(url.protocol)
    ) {
      diagnostics.unexpectedExternalRequests.push(request.url());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());

    if (url.origin === localOrigin && response.status() >= 400) {
      diagnostics.localFailures.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());

    if (url.origin === localOrigin) {
      diagnostics.localFailures.push(`FAILED ${url.pathname}`);
    }
  });

  return diagnostics;
}

async function preparePage(page) {
  const apiRequests = [];
  const unexpectedApiRequests = [];

  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );

  const apiResponse = (pathname) => {
    if (pathname === "/api/tech-news") return { ok: true, techNews: [] };
    if (pathname === "/api/infrastructure-status") {
      return { ok: true, providers: [] };
    }
    if (pathname === "/api/system-status") return systemStatusFixture();
    if (pathname === "/api/system-status/history") return systemStatusHistoryFixture();
    if (pathname === "/api/system-status/incidents") return systemStatusIncidentsFixture();
    if (pathname === "/api/steam-library") return { ok: true, games: [] };
    return null;
  };

  for (const origin of apiOrigins) {
    await page.route(`${origin}/**`, (route) => {
      const url = new URL(route.request().url());
      const body = apiResponse(url.pathname);

      apiRequests.push(url.pathname);
      if (!body) {
        unexpectedApiRequests.push(route.request().url());
      }

      return route.fulfill({
        status: body ? 200 : 500,
        contentType: "application/json",
        body: JSON.stringify(body || { ok: false }),
      });
    });
  }

  return {
    apiRequests,
    diagnostics: observePage(page),
    unexpectedApiRequests,
  };
}

async function installDeterministicStatusApiMock(page) {
  const responses = {
    "/api/system-status": systemStatusFixture(),
    "/api/system-status/history": systemStatusHistoryFixture(),
    "/api/system-status/incidents": systemStatusIncidentsFixture(),
  };

  await page.addInitScript(({ origins, responseBodies }) => {
    const nativeFetch = window.fetch.bind(window);
    const paths = new Set(Object.keys(responseBodies));
    window.__statusApiMock = { started: [], consumed: [] };

    window.fetch = async (input, init = {}) => {
      const url = new URL(
        typeof input === "string" ? input : input.url,
        window.location.href,
      );

      if (!origins.includes(url.origin) || !paths.has(url.pathname)) {
        return nativeFetch(input, init);
      }

      window.__statusApiMock.started.push(url.pathname);
      if (init.signal?.aborted) {
        throw init.signal.reason ?? new DOMException("Aborted", "AbortError");
      }

      const response = new Response(JSON.stringify(responseBodies[url.pathname]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      const readJson = response.json.bind(response);
      Object.defineProperty(response, "json", {
        value: async () => {
          const body = await readJson();
          window.__statusApiMock.consumed.push(url.pathname);
          return body;
        },
      });
      return response;
    };
  }, { origins: apiOrigins, responseBodies: responses });
}

async function expectNoHorizontalOverflow(page) {
  const geometry = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));

  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(
    geometry.clientWidth + 1,
  );
  expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(
    geometry.clientWidth + 1,
  );
}

function expectNoDiagnostics(state) {
  expect(state.diagnostics.consoleErrors).toEqual([]);
  expect(state.diagnostics.localFailures).toEqual([]);
  expect(state.diagnostics.pageErrors).toEqual([]);
  expect(state.diagnostics.unexpectedExternalRequests).toEqual([]);
  expect(state.unexpectedApiRequests).toEqual([]);
}

test("localized status histories remain separate from current health", async ({ page }) => {
  await installDeterministicStatusApiMock(page);
  const state = await preparePage(page);
  await page.setViewportSize(mobileViewport);
  const expectedApiRequests = [
    "/api/system-status",
    "/api/system-status/history",
    "/api/system-status/incidents",
  ];
  for (const route of ["/status/", "/en/status/", "/ja/status/"]) {
    await page.goto(route, { waitUntil: "load" });
    await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
    await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "ready");
    await expect(page.locator(".system-status-history-cell")).toHaveCount(3);
    await expect(page.locator(".system-status-history-cell .status-symbol")).toHaveText(["●", "●", "●"]);
    await expect(page.locator("#systemStatusIncidents")).toHaveAttribute("data-incidents-state", "ready");
    await expect(page.locator(".system-status-incidents-message")).toBeVisible();
    await expect(page.locator(".system-status-incident")).toHaveCount(0);
    const mockState = await page.evaluate(() => window.__statusApiMock);
    expect(mockState.started).toEqual(expectedApiRequests);
    expect([...mockState.consumed].sort()).toEqual([...expectedApiRequests].sort());
    await expectNoHorizontalOverflow(page);
  }
  expect(state.apiRequests).toEqual([]);
  expectNoDiagnostics(state);
});

test.describe("localized route shell", () => {
  for (const locale of homeLocales) {
    test(`${locale.name} Home loads the initialized local shell`, async ({
      page,
    }) => {
      const state = await preparePage(page);
      const response = await page.goto(locale.route, { waitUntil: "load" });
      const sidebar = page.locator("#site-sidebar");
      const languageSwitch = sidebar.locator(".lang-switch");
      const currentPrimaryLinks = sidebar.locator(
        'nav a[aria-current="page"]',
      );

      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(sidebar.locator(".sidebar-top")).toBeVisible();
      await expect(sidebar.locator("nav a")).toHaveCount(5);
      await expect(languageSwitch).toHaveAttribute("aria-label", /.+/);
      await expect(languageSwitch.locator("a")).toHaveCount(3);
      await expect(languageSwitch.locator("a.active")).toHaveCount(1);
      await expect(languageSwitch.locator("a.active")).toHaveAttribute(
        "href",
        locale.route,
      );
      await expect(currentPrimaryLinks).toHaveCount(0);
      await expect(page.locator("#techNewsCards > .tech-news-status")).toHaveCount(
        1,
      );
      await expect(page.locator(".infrastructure-status-card")).toHaveCount(2);
      expect(state.apiRequests).toEqual([
        "/api/system-status",
        "/api/tech-news",
        "/api/infrastructure-status",
      ]);
      await expectNoHorizontalOverflow(page);
      expectNoDiagnostics(state);
    });
  }
});

test("mobile drawer keeps focus and inert state through both close paths", async ({
  page,
}) => {
  const state = await preparePage(page);
  await page.setViewportSize(mobileViewport);
  const response = await page.goto("/en/", { waitUntil: "load" });
  const sidebar = page.locator("#site-sidebar");
  const toggle = page.locator("#menuToggle");
  const main = page.locator("main.main");
  const drawerFocusable = sidebar.locator(drawerFocusableSelector);
  const firstDrawerControl = drawerFocusable.first();
  const lastDrawerControl = drawerFocusable.last();

  expect(response?.status()).toBe(200);
  await expect(page.locator("#techNewsCards > .tech-news-status")).toHaveCount(1);
  await expect(page.locator(".infrastructure-status-card")).toHaveCount(2);
  await expect(sidebar).not.toHaveClass(/\bopen\b/);
  await expect(sidebar).toHaveAttribute("aria-hidden", "true");
  expect(await sidebar.evaluate((element) => element.inert)).toBe(true);
  await expect(toggle).toHaveAccessibleName("Open navigation");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAccessibleName("Close navigation");
  await expect(sidebar).toHaveClass(/\bopen\b/);
  await expect(sidebar).not.toHaveAttribute("aria-hidden");
  await expect(firstDrawerControl).toBeFocused();
  expect(await main.evaluate((element) => element.inert)).toBe(true);

  const backgroundLink = main.locator("a").first();
  await backgroundLink.evaluate((element) => element.focus());
  await expect(firstDrawerControl).toBeFocused();
  await lastDrawerControl.focus();
  await page.keyboard.press("Tab");
  await expect(firstDrawerControl).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(sidebar).not.toHaveClass(/\bopen\b/);
  await expect(sidebar).toHaveAttribute("aria-hidden", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAccessibleName("Open navigation");
  expect(await main.evaluate((element) => element.inert)).toBe(false);
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(sidebar).toHaveClass(/\bopen\b/);
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(sidebar).not.toHaveClass(/\bopen\b/);
  await expect(sidebar).toHaveAttribute("aria-hidden", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(await main.evaluate((element) => element.inert)).toBe(false);
  await expect(toggle).toBeFocused();

  await expectNoHorizontalOverflow(page);
  expectNoDiagnostics(state);
});

test("native Lightbox blocks background interaction and restores focus", async ({
  page,
}) => {
  const state = await preparePage(page);
  const response = await page.goto("/en/works/", { waitUntil: "load" });
  const trigger = page.locator(
    '.showcase-photo-card img.zoomable[src$="/images/2002_w.webp"]',
  );
  const dialog = page.locator("#lightbox");
  const accessibleDialog = page.getByRole("dialog", { name: "Image preview" });
  const lightboxImage = page.locator("#lightboxImg");
  const closeButton = page.getByRole("button", { name: "Close preview" });

  expect(response?.status()).toBe(200);
  await expect(trigger).toHaveAttribute("tabindex", "0");
  await expect(trigger).toHaveAttribute("role", "button");
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  const triggerState = await trigger.evaluate((image) => ({
    alt: image.alt,
    displayPath: new URL(image.currentSrc || image.src).pathname,
    fullPath: new URL(image.dataset.fullSrc, window.location.href).pathname,
  }));

  expect(triggerState.displayPath).not.toBe(triggerState.fullPath);

  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(accessibleDialog).toBeVisible();
  await expect(dialog).toHaveAttribute("open", "");
  await expect(accessibleDialog).toHaveAccessibleName("Image preview");
  await expect(lightboxImage).toHaveAttribute("alt", triggerState.alt);
  expect(
    await lightboxImage.evaluate(
      (image) => new URL(image.currentSrc || image.src).pathname,
    ),
  ).toBe(triggerState.fullPath);
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
    true,
  );

  const backgroundLink = page.locator("#site-sidebar a").first();
  await backgroundLink.evaluate((element) => element.focus());
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
    true,
  );

  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");
  await expect(dialog).not.toHaveClass(/\bshow\b/);
  await expect(lightboxImage).toHaveAttribute("src", "");
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAttribute("open", "");
  await expect(closeButton).toBeFocused();
  await closeButton.click();
  await expect(dialog).not.toHaveAttribute("open", "");
  await expect(dialog).not.toHaveClass(/\bshow\b/);
  await expect(lightboxImage).toHaveAttribute("src", "");
  await expect(trigger).toBeFocused();

  expectNoDiagnostics(state);
});

test("About initializes the accessible VS Code workspace with selectable profile text", async ({
  page,
}) => {
  const state = await preparePage(page);
  const response = await page.goto("/en/about/", { waitUntil: "load" });
  const workspace = page.getByRole("region", {
    name: "huihuidev.py profile code workspace",
  });
  const editor = page.getByRole("region", {
    name: "huihuidev.py source code",
  });
  const code = page.locator("#profileCode");

  expect(response?.status()).toBe(200);
  await expect(page.locator("#steamFavorites .steam-loading")).toHaveCount(0);
  await expect(workspace).toHaveAttribute("data-vscode-ready", "true");
  await expect(editor).toHaveCount(1);
  await expect(code).not.toBeEmpty();
  await expect(code).toContainText("class HuiHui");
  expect(
    await code.evaluate((element) => {
      const range = document.createRange();
      const selection = window.getSelection();

      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      const selectedText = selection.toString().trim();
      selection.removeAllRanges();

      return selectedText.length;
    }),
  ).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Copy code" })).toHaveCount(0);
  expect(state.apiRequests).toEqual(["/api/steam-library"]);
  expectNoDiagnostics(state);
});

test("Tier Maker uploads and moves an item with the keyboard", async ({ page }) => {
  const state = await preparePage(page);
  const response = await page.goto("/en/tools/tier-maker/", {
    waitUntil: "load",
  });
  const uploadButton = page.getByRole("button", { name: "Upload Images" });
  const fileChooserPromise = page.waitForEvent("filechooser");

  expect(response?.status()).toBe(200);
  await expect(page.locator(".tier-toolbar")).toHaveAttribute(
    "aria-label",
    "Tier Maker controls",
  );
  await uploadButton.focus();
  await expect(uploadButton).toBeFocused();
  await uploadButton.press("Enter");
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: imageBuffer,
  });

  const item = page.locator('.tier-item[alt="sample.png"]');
  const moveStatus = page.locator("#tierMoveStatus");
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute("role", "listitem");
  await expect(item).toHaveAttribute("tabindex", "0");
  await expect(item).toHaveAttribute(
    "aria-keyshortcuts",
    "ArrowLeft ArrowRight ArrowUp ArrowDown",
  );

  await item.focus();
  await page.keyboard.press("ArrowUp");
  await expect(item).toBeFocused();
  expect(
    await item.evaluate((element) =>
      element.parentElement?.getAttribute("aria-label"),
    ),
  ).toBe("B tier");
  await expect(moveStatus).toHaveAttribute("role", "status");
  await expect(moveStatus).toHaveAttribute("aria-live", "polite");
  await expect(moveStatus).toHaveText(
    "sample.png moved to B tier, position 1 of 1.",
  );
  expect(state.apiRequests).toEqual([]);
  await expectNoHorizontalOverflow(page);
  expectNoDiagnostics(state);
});
