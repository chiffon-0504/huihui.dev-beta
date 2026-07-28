import { expect, test } from "@playwright/test";

const STEAM_API_URL = "https://api.huihui.dev/api/steam-library";
const BANNER_APPID = 3418570;
const FAVORITE_APPIDS = [2458530, 1829980, 1044620, 3682050];
const locales = [
  {
    id: "zh",
    path: "/about/",
    hours: "小時",
    steam: {
      loading: "正在載入 Steam 遊戲庫...",
      bannerUnavailable: "精選遊戲目前沒有資料。",
      gamesUnavailable: "目前沒有可顯示的 Steam 收藏遊戲。",
      loadError: "Steam 遊戲暫時無法載入。",
      timeout: "Steam 遊戲載入逾時，請稍後再試。",
    },
  },
  {
    id: "en",
    path: "/en/about/",
    hours: "hrs",
    steam: {
      loading: "Loading Steam library...",
      bannerUnavailable: "The featured game is currently unavailable.",
      gamesUnavailable: "No favorite Steam games are currently available.",
      loadError: "Steam games are temporarily unavailable.",
      timeout: "Steam games took too long to load. Please try again.",
    },
  },
  {
    id: "ja",
    path: "/ja/about/",
    hours: "時間",
    steam: {
      loading: "Steamライブラリを読み込み中...",
      bannerUnavailable: "注目のゲームは現在表示できません。",
      gamesUnavailable: "現在表示できるSteamのお気に入りゲームはありません。",
      loadError: "Steamゲームを一時的に読み込めません。",
      timeout: "Steamゲームの読み込みがタイムアウトしました。もう一度お試しください。",
    },
  },
];
const englishStatusText = Object.values(
  locales.find((locale) => locale.id === "en").steam,
);

function steamGame(appid, playtimeHours = 12.5) {
  return {
    appid,
    name: `Fixture game ${appid}`,
    playtimeHours,
    coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    capsuleUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    storeUrl: `https://store.steampowered.com/app/${appid}/`,
  };
}

function allSteamGames(playtimeHours = 12.5) {
  return [
    steamGame(BANNER_APPID, playtimeHours),
    ...FAVORITE_APPIDS.map((appid) => steamGame(appid, playtimeHours)),
  ];
}

function steamResponse(games) {
  return {
    ok: true,
    source: "Steam",
    count: games.length,
    games,
  };
}

async function stubAboutDependencies(page) {
  await page.route("https://cdn.jsdelivr.net/**", (route) => {
    const isStyle = route.request().resourceType() === "stylesheet";
    return route.fulfill({
      status: 200,
      contentType: isStyle ? "text/css" : "application/javascript",
      body: isStyle
        ? ""
        : `
          window.Prism = window.Prism || {};
          window.Prism.highlightElement = window.Prism.highlightElement || function (code) {
            const language = Array.from(code.classList).find((name) =>
              name.startsWith("language-"),
            );
            if (language) code.parentElement?.classList.add(language);
          };
        `,
    });
  });

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
}

async function loadAboutWithSteamRoute(page, locale, handler) {
  let interceptedRequests = 0;

  await stubAboutDependencies(page);
  await page.route(STEAM_API_URL, async (route) => {
    interceptedRequests += 1;
    await handler(route);
  });

  const response = await page.goto(locale.path, { waitUntil: "load" });
  expect(response?.status()).toBe(200);

  return () => interceptedRequests;
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function expectTerminalState(page, locale) {
  await expect(page.locator("#steamFavorites .steam-loading")).toHaveCount(0);
  await expect(page.locator("#galgameBannerHours")).not.toHaveText(
    locale.steam.loading,
  );

  const sectionText = await page.locator(".steam-favorites-card").innerText();
  expect(sectionText).not.toContain("Loading...");

  if (locale.id !== "en") {
    for (const englishText of englishStatusText) {
      expect(sectionText).not.toContain(englishText);
    }
  }
}

async function expectSuccessfulSteamState(
  page,
  locale,
  favoriteCount,
  bannerHours = 12.5,
) {
  await expect(page.locator("#galgameBannerHours")).toHaveText(
    `${bannerHours} ${locale.hours}`,
  );
  await expect(page.locator("#steamFavorites > .steam-game-card")).toHaveCount(
    favoriteCount,
  );
  await expectTerminalState(page, locale);
}

async function expectFailureState(page, locale, key) {
  await expect(page.locator("#galgameBannerHours")).toHaveText(locale.steam[key]);
  await expect(page.locator("#steamFavorites > .steam-error")).toHaveText(
    locale.steam[key],
  );
  await expect(page.locator("#steamFavorites > .steam-game-card")).toHaveCount(0);
  await expectTerminalState(page, locale);
}

async function installSteamFetchQueue(page, responses) {
  await page.addInitScript(
    ({ apiUrl, queuedResponses }) => {
      const nativeFetch = window.fetch.bind(window);
      window.__steamFetchCount = 0;

      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input.url;

        if (url !== apiUrl) {
          return nativeFetch(input, init);
        }

        const response = queuedResponses[window.__steamFetchCount];
        window.__steamFetchCount += 1;

        return Promise.resolve(
          new Response(JSON.stringify(response.body), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      };
    },
    { apiUrl: STEAM_API_URL, queuedResponses: responses },
  );
}

for (const locale of locales) {
  test.describe(`${locale.id} About Steam terminal states`, () => {
    test("renders the banner, every favorite, and existing image fallback", async ({
      page,
    }) => {
      const getRequestCount = await loadAboutWithSteamRoute(
        page,
        locale,
        (route) => fulfillJson(route, steamResponse(allSteamGames())),
      );

      await expectSuccessfulSteamState(page, locale, FAVORITE_APPIDS.length);
      await expect(page.locator("#galgameBannerLink")).toHaveAttribute(
        "href",
        `https://store.steampowered.com/app/${BANNER_APPID}/`,
      );

      const fallbackImage = page
        .locator(
          `#steamFavorites > .steam-game-card[href="https://store.steampowered.com/app/1829980/"] img`,
        );
      await expect(fallbackImage).toHaveAttribute(
        "src",
        "/images/games/Cafe-Stella-and-the-Reapers-Butterflies.webp",
      );
      await fallbackImage.dispatchEvent("error");
      await expect(fallbackImage).toHaveAttribute(
        "src",
        "https://cdn.cloudflare.steamstatic.com/steam/apps/1829980/header.jpg",
      );
      expect(getRequestCount()).toBe(1);
    });

    test("keeps favorite cards when the banner game is missing", async ({
      page,
    }) => {
      const games = FAVORITE_APPIDS.map((appid) => steamGame(appid));
      const getRequestCount = await loadAboutWithSteamRoute(
        page,
        locale,
        (route) => fulfillJson(route, steamResponse(games)),
      );

      await expect(page.locator("#galgameBannerHours")).toHaveText(
        locale.steam.bannerUnavailable,
      );
      await expect(page.locator("#steamFavorites > .steam-game-card")).toHaveCount(
        FAVORITE_APPIDS.length,
      );
      await expect(page.locator("#steamFavorites > .steam-error")).toHaveCount(0);
      await expect(
        page.locator(".steam-favorites-card.steam-error"),
      ).toHaveCount(0);
      await expectTerminalState(page, locale);
      expect(getRequestCount()).toBe(1);
    });

    test("renders the banner and only available favorites", async ({ page }) => {
      const games = [
        steamGame(BANNER_APPID),
        steamGame(FAVORITE_APPIDS[0]),
        steamGame(FAVORITE_APPIDS[2]),
      ];
      const getRequestCount = await loadAboutWithSteamRoute(
        page,
        locale,
        (route) => fulfillJson(route, steamResponse(games)),
      );

      await expectSuccessfulSteamState(page, locale, 2);
      expect(getRequestCount()).toBe(1);
    });

    test("shows separate empty states for an empty game array", async ({
      page,
    }) => {
      const getRequestCount = await loadAboutWithSteamRoute(
        page,
        locale,
        (route) => fulfillJson(route, []),
      );

      await expect(page.locator("#galgameBannerHours")).toHaveText(
        locale.steam.bannerUnavailable,
      );
      await expect(page.locator("#steamFavorites > .steam-error")).toHaveText(
        locale.steam.gamesUnavailable,
      );
      await expectTerminalState(page, locale);
      expect(getRequestCount()).toBe(1);
    });

    test("shows localized error states for HTTP 500", async ({ page }) => {
      const getRequestCount = await loadAboutWithSteamRoute(
        page,
        locale,
        (route) =>
          fulfillJson(
            route,
            {
              ok: false,
              source: "Steam",
              message: "internal endpoint detail",
              games: [],
            },
            500,
          ),
      );

      await expectFailureState(page, locale, "loadError");
      await expect(page.locator(".steam-favorites-card")).not.toContainText(
        "internal endpoint detail",
      );
      expect(getRequestCount()).toBe(1);
    });

    test("shows localized error states for a network rejection", async ({
      page,
    }) => {
      const getRequestCount = await loadAboutWithSteamRoute(
        page,
        locale,
        (route) => route.abort("failed"),
      );

      await expectFailureState(page, locale, "loadError");
      expect(getRequestCount()).toBe(1);
    });

    test("shows localized error states for malformed JSON", async ({ page }) => {
      const getRequestCount = await loadAboutWithSteamRoute(
        page,
        locale,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "{",
          }),
      );

      await expectFailureState(page, locale, "loadError");
      expect(getRequestCount()).toBe(1);
    });

    test("shows localized error states for a valid JSON invalid shape", async ({
      page,
    }) => {
      const getRequestCount = await loadAboutWithSteamRoute(
        page,
        locale,
        (route) =>
          fulfillJson(route, {
            ok: true,
            source: "Steam",
            games: { malformed: true },
          }),
      );

      await expectFailureState(page, locale, "loadError");
      expect(getRequestCount()).toBe(1);
    });

    test("uses a fake clock to finish a request that never resolves", async ({
      page,
    }) => {
      await page.clock.install();
      await stubAboutDependencies(page);
      await page.addInitScript((apiUrl) => {
        const nativeFetch = window.fetch.bind(window);
        window.__steamFetchCount = 0;

        window.fetch = (input, init = {}) => {
          const url = typeof input === "string" ? input : input.url;

          if (url !== apiUrl) {
            return nativeFetch(input, init);
          }

          window.__steamFetchCount += 1;

          return new Promise((resolve, reject) => {
            const rejectAbort = () =>
              reject(new DOMException("The operation was aborted.", "AbortError"));

            if (init.signal?.aborted) {
              rejectAbort();
            } else {
              init.signal?.addEventListener("abort", rejectAbort, { once: true });
            }
          });
        };
      }, STEAM_API_URL);

      const response = await page.goto(locale.path, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("#steamFavorites .steam-loading")).toHaveText(
        locale.steam.loading,
      );

      const timeoutMs = await page.evaluate(() => STEAM_REQUEST_TIMEOUT_MS);
      await page.clock.fastForward(timeoutMs);

      await expectFailureState(page, locale, "timeout");
      expect(await page.evaluate(() => window.__steamFetchCount)).toBe(1);
    });

    test("repeated initialization replaces prior content and stale success", async ({
      page,
    }) => {
      const firstGames = allSteamGames(1);
      const secondGames = allSteamGames(7);

      await stubAboutDependencies(page);
      await installSteamFetchQueue(page, [
        { status: 200, body: steamResponse(firstGames) },
        { status: 200, body: steamResponse(secondGames) },
        { status: 500, body: { ok: false, games: [] } },
      ]);

      const response = await page.goto(locale.path, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expectSuccessfulSteamState(page, locale, FAVORITE_APPIDS.length, 1);

      await page.evaluate(() => renderSteamFavorites());
      await expect
        .poll(() => page.evaluate(() => window.__steamFetchCount))
        .toBe(2);
      await expect(page.locator("#steamFavorites .steam-game-hours").first()).toHaveText(
        `7 ${locale.hours}`,
      );
      await expectSuccessfulSteamState(page, locale, FAVORITE_APPIDS.length, 7);

      await page.evaluate(() => renderSteamFavorites());
      await expectFailureState(page, locale, "loadError");
      await expect(page.locator("#galgameBannerName")).toHaveText(
        "Summer Pockets REFLECTION BLUE",
      );
      await expect(page.locator("#galgameBannerLink")).toHaveAttribute(
        "href",
        `https://store.steampowered.com/app/${BANNER_APPID}/`,
      );
      expect(await page.evaluate(() => window.__steamFetchCount)).toBe(3);
    });

    test("keeps terminal content visible at the required desktop and mobile sizes", async ({
      page,
    }) => {
      const getRequestCount = await loadAboutWithSteamRoute(
        page,
        locale,
        (route) => fulfillJson(route, steamResponse(allSteamGames())),
      );

      for (const viewport of [
        { width: 1440, height: 900, columns: 4 },
        { width: 390, height: 844, columns: 1 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(locale.path, { waitUntil: "load" });
        await expectSuccessfulSteamState(page, locale, FAVORITE_APPIDS.length);

        const layout = await page.locator("#steamFavorites").evaluate((element) => ({
          columns: getComputedStyle(element).gridTemplateColumns
            .trim()
            .split(/\s+/).length,
          fitsViewport:
            element.getBoundingClientRect().right <= document.documentElement.clientWidth,
          hasHorizontalOverflow: element.scrollWidth > element.clientWidth + 1,
        }));

        expect(layout).toEqual({
          columns: viewport.columns,
          fitsViewport: true,
          hasHorizontalOverflow: false,
        });
      }

      expect(getRequestCount()).toBe(3);
    });
  });
}
