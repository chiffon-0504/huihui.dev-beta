import { expect, test } from "@playwright/test";

const localeOrder = ["zh", "en", "ja"];
const homeRoutes = [
  {
    path: "/",
    lang: "zh-Hant",
    subtitle: "專注於 Web UI、程式碼呈現與嵌入式系統的個人開發空間。",
    aboutHref: "/about/",
    contactHref: "/contact/",
  },
  {
    path: "/en/",
    lang: "en",
    subtitle:
      "A personal development space focused on Web UI, code rendering, and embedded systems.",
    aboutHref: "/en/about/",
    contactHref: "/en/contact/",
  },
  {
    path: "/ja/",
    lang: "ja",
    subtitle:
      "Web UI、コードレンダリング、組み込みシステムに焦点を当てた個人開発スペースです。",
    aboutHref: "/ja/about/",
    contactHref: "/ja/contact/",
  },
];
const localizedHomePaths = { zh: "/", en: "/en/", ja: "/ja/" };

async function stubExternalDependencies(page) {
  await page.route("https://api.huihui.dev/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === "/api/tech-news"
      ? { ok: true, techNews: [] }
      : pathname === "/api/infrastructure-status"
        ? { ok: true, providers: [] }
        : pathname === "/api/system-status"
          ? {
              ok: true,
              status: "operational",
              components: [
                { id: "website", status: "operational" },
                { id: "api", status: "operational" },
                { id: "contact", status: "operational" },
              ],
              checkedAt: "2026-08-28T12:00:00.000Z",
            }
      : null;

    return route.fulfill({
      status: body ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(body || { ok: false }),
    });
  });
}

for (const route of homeRoutes) {
  test(`${route.path} preserves accessible Home heading semantics`, async ({
    browserName,
    page,
  }) => {
    const consoleErrors = [];
    const pageErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await stubExternalDependencies(page);
    const response = await page.goto(route.path, { waitUntil: "load" });
    const main = page.locator("main.main");
    const hero = main.locator(".home-hero");
    const subtitle = hero.locator('[data-i18n="home.hero.subtitle"]');
    const mainHeadings = main.locator("h1, h2, h3, h4, h5, h6");
    const headingLevels = await mainHeadings.evaluateAll((elements) =>
      elements.map((element) => Number(element.tagName.slice(1))),
    );

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
    await expect(main.locator("h1")).toHaveCount(1);
    await expect(main.locator("h1")).toHaveText("huihui.dev");
    await expect(subtitle).toHaveCount(1);
    await expect(subtitle).toHaveAttribute("class", "home-subtitle");
    await expect(subtitle).toHaveAttribute(
      "data-i18n",
      "home.hero.subtitle",
    );
    await expect(subtitle).toHaveText(route.subtitle);
    await expect(subtitle).toHaveRole("paragraph");
    await expect(
      page.getByRole("heading", { name: route.subtitle }),
    ).toHaveCount(0);
    await expect(main.getByRole("heading")).toHaveCount(7);

    expect(headingLevels).toEqual([1, 2, 2, 2, 2, 3, 3]);
    expect(
      headingLevels.every(
        (level, index) =>
          index === 0 || level - headingLevels[index - 1] <= 1,
      ),
    ).toBe(true);
    for (const id of [
      "systemStatusTitle",
      "websiteVersionTitle",
      "techNewsTitle",
      "infrastructureStatusTitle",
    ]) {
      expect(
        await main.locator(`#${id}`).evaluate((element) => element.tagName),
      ).toBe("H2");
    }

    await page.evaluate(() => applyI18n());
    await expect(subtitle).toHaveCount(1);
    await expect(subtitle).toHaveText(route.subtitle);

    const languageLinks = page.locator("#site-sidebar .lang-switch a");
    await expect(languageLinks).toHaveCount(localeOrder.length);
    for (const [index, locale] of localeOrder.entries()) {
      await expect(languageLinks.nth(index)).toHaveAttribute(
        "href",
        localizedHomePaths[locale],
      );
    }

    const heroButtons = hero.locator(".hero-actions .hero-btn");
    await expect(heroButtons).toHaveCount(2);
    await expect(heroButtons.nth(0)).toHaveAttribute("href", route.aboutHref);
    await expect(heroButtons.nth(1)).toHaveAttribute("href", route.contactHref);
    expect(await heroButtons.nth(0).evaluate((element) => element.tabIndex)).toBe(
      0,
    );
    expect(await heroButtons.nth(1).evaluate((element) => element.tabIndex)).toBe(
      0,
    );
    await heroButtons.nth(0).focus();
    await expect(heroButtons.nth(0)).toBeFocused();
    if (browserName === "webkit") {
      // Bundled WebKit excludes ordinary anchors from its plain-Tab sequence.
      // Explicit focus verifies focusability; it does not emulate Safari Tab navigation.
      await heroButtons.nth(1).focus();
    } else {
      // Chromium and Firefox retain native plain-Tab sequential navigation.
      await page.keyboard.press("Tab");
    }
    await expect(heroButtons.nth(1)).toBeFocused();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
