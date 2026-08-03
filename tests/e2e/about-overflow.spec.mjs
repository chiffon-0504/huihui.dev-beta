import { expect, test } from "@playwright/test";

const STEAM_API_URL = "https://api.huihui.dev/api/steam-library";
const MAX_ROUNDING_ERROR = 1;
const BANNER_APPID = 3418570;
const FAVORITE_APPIDS = [2458530, 1829980, 1044620, 3682050];

const locales = [
  { id: "zh", path: "/about/", htmlLang: "zh-Hant" },
  { id: "en", path: "/en/about/", htmlLang: "en" },
  { id: "ja", path: "/ja/about/", htmlLang: "ja" },
];

const viewports = [
  { width: 1728, height: 900 },
  { width: 1440, height: 900 },
  { width: 1201, height: 900 },
  { width: 1200, height: 900 },
  { width: 1024, height: 768 },
  { width: 901, height: 844 },
  { width: 900, height: 844 },
  { width: 390, height: 844 },
];

const steamStates = [
  { id: "success", status: 200 },
  { id: "localized-error", status: 200 },
];

function steamGame(appid) {
  return {
    appid,
    name: `Fixture game ${appid}`,
    playtimeHours: 12.5,
    coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    capsuleUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    storeUrl: `https://store.steampowered.com/app/${appid}/`,
  };
}

function successfulSteamResponse() {
  const games = [
    steamGame(BANNER_APPID),
    ...FAVORITE_APPIDS.map((appid) => steamGame(appid)),
  ];

  return {
    ok: true,
    source: "Steam",
    count: games.length,
    games,
  };
}

async function stubAboutDependencies(page, steamState) {
  await page.route("https://cdn.cloudflare.steamstatic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: Buffer.from(
        "R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
        "base64",
      ),
    }),
  );

  await page.route(STEAM_API_URL, (route) =>
    route.fulfill({
      status: steamState.status,
      contentType: "application/json",
      body: JSON.stringify(
        steamState.id === "success"
          ? successfulSteamResponse()
          : {
              ok: false,
              source: "Steam",
              message: "fixture error detail",
              games: { invalid: true },
            },
      ),
    }),
  );
}

async function expectAboutStructure(page, locale) {
  await expect(page.locator("#aboutPage.about-page > .about-content")).toHaveCount(
    1,
  );
  await expect(
    page.locator(
      '#aboutPage > .about-content > .page-header > h1[data-i18n="about.title"]',
    ),
  ).toHaveCount(1);
  await expect(page.locator("#aboutPage .page-body")).toHaveCount(1);
  await expect(
    page.locator("#aboutPage .code-block.code-block-with-gutter .copy-btn"),
  ).toHaveCount(1);
  await expect(page.locator("#aboutPage .interest-cards > .interest-card")).toHaveCount(
    3,
  );
  await expect(page.locator("#aboutPage .rhythm-card")).toHaveCount(2);
  await expect(page.locator("#aboutPage .steam-favorites-card")).toHaveCount(1);

  const localizedContent = await page.evaluate((localeId) => ({
    heading: window.HUIHUI_I18N?.[localeId]?.about?.title,
    interests: window.HUIHUI_I18N?.[localeId]?.about?.interests,
  }), locale.id);

  expect(localizedContent.heading).toBeTruthy();
  expect(localizedContent.interests).toBeTruthy();
  await expect(page.locator("#aboutPage h1")).toHaveText(localizedContent.heading);
  await expect(page.locator("#aboutPage h2")).toHaveText(localizedContent.interests);
  await expect(page.locator("html")).toHaveAttribute("lang", locale.htmlLang);
}

async function expectSteamTerminalState(page, locale, steamState) {
  const localizedSteamText = await page.evaluate((localeId) => ({
    loading: window.HUIHUI_I18N?.[localeId]?.about?.steam?.loading,
    loadError: window.HUIHUI_I18N?.[localeId]?.about?.steam?.loadError,
  }), locale.id);

  await expect(page.locator("#steamFavorites .steam-loading")).toHaveCount(0);

  if (steamState.id === "success") {
    await expect(page.locator("#galgameBannerHours")).not.toHaveText(
      localizedSteamText.loading,
    );
    await expect(
      page.locator("#steamFavorites > .steam-game-card"),
    ).toHaveCount(FAVORITE_APPIDS.length);
    await expect(page.locator("#galgameBannerLink")).toHaveAttribute(
      "href",
      `https://store.steampowered.com/app/${BANNER_APPID}/`,
    );
    await expect(page.locator("#steamFavorites > .steam-error")).toHaveCount(0);
    return;
  }

  await expect(page.locator("#galgameBannerHours")).toHaveText(
    localizedSteamText.loadError,
  );
  await expect(page.locator("#steamFavorites > .steam-error")).toHaveText(
    localizedSteamText.loadError,
  );
  await expect(page.locator("#steamFavorites > .steam-game-card")).toHaveCount(0);

  if (locale.id !== "en") {
    const englishError = await page.evaluate(
      () => window.HUIHUI_I18N?.en?.about?.steam?.loadError,
    );
    await expect(page.locator(".steam-favorites-card")).not.toContainText(
      englishError,
    );
  }
}

async function expectContainedLayout(page, viewport) {
  const layout = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const clientWidth = documentElement.clientWidth;
    const selectors = [".main", ".page-shell", ".about-page", ".about-content"];
    const elements = Object.fromEntries(
      selectors.map((selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return [
          selector,
          {
            left: rect.left,
            right: rect.right,
            width: rect.width,
          },
        ];
      }),
    );
    const aboutContentRect = document
      .querySelector(".about-content")
      .getBoundingClientRect();
    const codeBlockRect = document
      .querySelector(".about-content .code-block")
      .getBoundingClientRect();

    const aboutMainViewportWidthRules = [];
    const collectAboutMainViewportWidthRules = (rules) => {
      for (const rule of rules) {
        if ("cssRules" in rule) {
          collectAboutMainViewportWidthRules(rule.cssRules);
        }

        if (!("selectorText" in rule)) continue;
        const selectors = rule.selectorText
          .split(",")
          .map((selector) => selector.trim());

        if (!selectors.includes("body:has(#aboutPage) .main")) continue;
        const width = rule.style.width;
        const maxWidth = rule.style.maxWidth;

        if (width.includes("vw") || maxWidth.includes("vw")) {
          aboutMainViewportWidthRules.push({ width, maxWidth });
        }
      }
    };

    for (const sheet of document.styleSheets) {
      if (sheet.href?.endsWith("/style.css")) {
        collectAboutMainViewportWidthRules(sheet.cssRules);
      }
    }

    return {
      aboutMainViewportWidthRules,
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
      elements,
      codeBlock: {
        left: codeBlockRect.left,
        right: codeBlockRect.right,
        contained:
          codeBlockRect.left >= aboutContentRect.left - 1 &&
          codeBlockRect.right <= aboutContentRect.right + 1,
      },
    };
  });

  expect(layout.aboutMainViewportWidthRules).toEqual([]);

  expect(layout.documentScrollWidth).toBeLessThanOrEqual(
    layout.clientWidth + MAX_ROUNDING_ERROR,
  );
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(
    layout.clientWidth + MAX_ROUNDING_ERROR,
  );

  for (const geometry of Object.values(layout.elements)) {
    expect(geometry.width).toBeLessThanOrEqual(
      layout.clientWidth + MAX_ROUNDING_ERROR,
    );
    expect(geometry.left).toBeGreaterThanOrEqual(-MAX_ROUNDING_ERROR);
    expect(geometry.right).toBeLessThanOrEqual(
      layout.clientWidth + MAX_ROUNDING_ERROR,
    );
  }

  expect(layout.codeBlock.contained).toBe(true);
  expect(layout.codeBlock.left).toBeGreaterThanOrEqual(-MAX_ROUNDING_ERROR);
  expect(layout.codeBlock.right).toBeLessThanOrEqual(
    layout.clientWidth + MAX_ROUNDING_ERROR,
  );

  if (viewport.width === 390) {
    const codeScroll = await page
      .locator('.about-content .code-block pre[class*="language-"]')
      .evaluate((pre) => {
        window.scrollTo(0, 0);
        pre.scrollLeft = 0;
        const canScroll = pre.scrollWidth > pre.clientWidth + 1;
        pre.scrollLeft = pre.scrollWidth;

        return {
          canScroll,
          documentScrollX: window.scrollX,
          overflowX: getComputedStyle(pre).overflowX,
          preScrollLeft: pre.scrollLeft,
        };
      });

    expect(codeScroll).toMatchObject({
      canScroll: true,
      documentScrollX: 0,
      overflowX: "auto",
    });
    expect(codeScroll.preScrollLeft).toBeGreaterThan(0);
  }

  const scrollX = await page.evaluate(() => {
    window.scrollTo(document.documentElement.scrollWidth, 0);
    return window.scrollX;
  });
  expect(scrollX).toBe(0);
}

for (const locale of locales) {
  for (const viewport of viewports) {
    for (const steamState of steamStates) {
      test(
        `${locale.id} About ${steamState.id} stays within ${viewport.width}x${viewport.height}`,
        async ({ page }) => {
          const consoleErrors = [];
          page.on("console", (message) => {
            if (message.type() === "error") consoleErrors.push(message.text());
          });
          page.on("pageerror", (error) => consoleErrors.push(error.message));

          await page.setViewportSize(viewport);
          await stubAboutDependencies(page, steamState);

          const response = await page.goto(locale.path, { waitUntil: "load" });
          expect(response?.status()).toBe(200);

          await expectAboutStructure(page, locale);
          await expectSteamTerminalState(page, locale, steamState);
          await expectContainedLayout(page, viewport);
          expect(consoleErrors).toEqual([]);
        },
      );
    }
  }
}
