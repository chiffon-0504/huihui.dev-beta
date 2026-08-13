import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const sharedScripts = [
  "/js/layout.js",
  "/js/glass-material.js",
  "/js/mobile-drawer.js",
  "/js/main.js",
  "/js/i18n.js",
];
const localeScripts = {
  zh: "/js/locales/zh.js",
  en: "/js/locales/en.js",
  ja: "/js/locales/ja.js",
};

function scriptsFor(locale, featureScripts = []) {
  return [...sharedScripts, localeScripts[locale], ...featureScripts];
}

const routeCases = [
  {
    name: "Home",
    route: "/",
    scripts: scriptsFor("zh", ["/js/home-cards.js"]),
  },
  {
    name: "About",
    route: "/about/",
    scripts: scriptsFor("zh", [
      "/vendor/prism/components/prism-core.min.js",
      "/vendor/prism/components/prism-python.min.js",
      "/vendor/prism/plugins/line-numbers/prism-line-numbers.min.js",
      "/js/code-blocks.js",
      "/js/lightbox.js",
      "/js/profile-code.js",
      "/js/about-page.js",
      "/js/about-code-line-numbers.js",
    ]),
  },
  {
    name: "Works",
    route: "/works/",
    scripts: scriptsFor("zh", ["/js/lightbox.js"]),
  },
  {
    name: "Milestones",
    route: "/milestones/",
    scripts: scriptsFor("zh", [
      "/js/lightbox.js",
      "/js/posts-data.js",
      "/js/posts-render.js",
    ]),
  },
  {
    name: "Contact",
    route: "/contact/",
    scripts: scriptsFor("zh", ["/js/contact.js"]),
  },
];

async function stubExternalDependencies(page) {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );
  await page.route("https://api.huihui.dev/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith("/api/tech-news")
      ? {
          ok: true,
          techNews: [
            {
              category: "Web",
              link: "https://example.com/c3",
              source: "C3 fixture",
              tag: "Audit",
              timeAgo: "now",
              title: "Route-specific scripts verified",
            },
          ],
        }
      : pathname.endsWith("/api/steam-library")
        ? { ok: true, games: [] }
        : null;

    return route.fulfill({
      status: body ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(body || { ok: false }),
    });
  });
}

function watchRuntime(page) {
  const diagnostics = { consoleErrors: [], pageErrors: [] };

  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));

  return diagnostics;
}

async function openLightboxWithKeyboard(page, trigger) {
  const lightbox = page.locator("#lightbox");

  await expect(trigger).toHaveAttribute("role", "button");
  await expect(trigger).toHaveAttribute("tabindex", "0");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(lightbox).toHaveAttribute("open", "");
  await expect(page.locator("#lightboxClose")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(lightbox).not.toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
}

async function verifyHome(page) {
  await expect(page.locator("#site-sidebar .sidebar-top")).toBeVisible();
  await expect(page.locator("#site-sidebar .lang-switch a").nth(1)).toHaveAttribute(
    "href",
    "/en/",
  );
  await expect(page.locator("#techNewsCards .tech-news-card")).toHaveCount(1);
  await expect(page.locator("#lightbox")).toHaveCount(0);
}

async function verifyAbout(page) {
  await expect(page.locator("#aboutPage.about-page")).toBeVisible();
  await expect(page.locator("#profileCode .token.keyword").first()).toBeVisible();
  await expect(page.locator(".custom-line-numbers")).toBeVisible();

  const copyButton = page.locator(".copy-btn");
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect
    .poll(() => page.evaluate(() => window.__c3ClipboardWrites.length))
    .toBe(1);

  await openLightboxWithKeyboard(
    page,
    page.locator("#aboutPage img.zoomable:not(.no-lightbox)").first(),
  );
}

async function verifyWorks(page) {
  const trigger = page.locator(".showcase-photo-card img.zoomable").first();

  await expect(page.locator(".showcase-card")).not.toHaveCount(0);
  await expect
    .poll(() => trigger.evaluate((image) => new URL(image.currentSrc).pathname))
    .toMatch(/^\/images\/2002_w(?:-\d+)?\.webp$/);
  await openLightboxWithKeyboard(page, trigger);
}

async function verifyMilestones(page) {
  const trigger = page.locator("#postsList img.zoomable").first();

  await expect(page.locator("#postsList .post-card")).not.toHaveCount(0);
  await trigger.scrollIntoViewIfNeeded();
  await expect
    .poll(() => trigger.evaluate((image) => new URL(image.currentSrc).pathname))
    .toMatch(/^\/images\/3013_p-(?:800|1600)\.webp$/);
  await expect(trigger).toHaveAttribute("data-full-src", "/images/3013_p.webp");
  await openLightboxWithKeyboard(page, trigger);
}

async function verifyContact(page, requestedScripts) {
  const form = page.locator("#contact-form");

  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute("action", "https://api.huihui.dev/api/contact");
  expect(
    await page.evaluate(() => ({
      beta: getHuihuiApiBase("branch.huihuidev-beta.pages.dev"),
      production: getHuihuiApiBase("huihui.dev"),
    })),
  ).toEqual({
    beta: "https://huihui-api-beta.huihuigames01.workers.dev",
    production: "https://api.huihui.dev",
  });
  expect(requestedScripts).toContain(
    "https://challenges.cloudflare.com/turnstile/v0/api.js",
  );
}

const functionalChecks = {
  Home: verifyHome,
  About: verifyAbout,
  Works: verifyWorks,
  Milestones: verifyMilestones,
  Contact: verifyContact,
};

for (const routeCase of routeCases) {
  test(`${routeCase.name} requests only its owned scripts and remains functional`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const writes = [];

      Object.defineProperty(window, "__c3ClipboardWrites", { value: writes });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText(text) {
            writes.push(text);
            return Promise.resolve();
          },
        },
      });
    });
    await stubExternalDependencies(page);

    const diagnostics = watchRuntime(page);
    const requestedScripts = [];

    page.on("request", (request) => {
      if (request.resourceType() === "script") {
        requestedScripts.push(request.url());
      }
    });

    const response = await page.goto(routeCase.route, { waitUntil: "load" });

    expect(response?.status()).toBe(200);
    await functionalChecks[routeCase.name](page, requestedScripts);

    const localScripts = requestedScripts
      .filter((url) => new URL(url).origin === localOrigin)
      .map((url) => new URL(url).pathname)
      .sort();

    expect(localScripts).toEqual([...routeCase.scripts].sort());
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
  });
}
