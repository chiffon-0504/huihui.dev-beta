import { expect, test } from "@playwright/test";

const apiOrigins = new Set([
  "https://api.huihui.dev",
  "https://huihui-api-beta.huihuigames01.workers.dev",
]);
const homeRoutes = [
  {
    path: "/",
    lang: "zh-Hant",
    status: "🟢 更新中",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "改善 Tier Maker 分級表與「待排序」區塊之間的視覺分隔與間距",
      "Contact 公開信箱備用連結改為開啟 Gmail 撰寫新信，並預填 contact@huihui.dev",
      "新增 Ave Mujica LIVE TOUR 2026「Exitus」台北 DAY2 三語 Milestone 與現場照片",
      "新增 #Exitus_TAIPEI／#AveMujica 連結，並改善三語圖片描述的安全呈現",
    ],
  },
  {
    path: "/en/",
    lang: "en",
    status: "🟢 Active",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "Improved visual separation and spacing between the Tier Maker board and Unsorted section",
      "Updated the Contact email fallback to open Gmail Compose with contact@huihui.dev prefilled",
      "Added the localized Ave Mujica LIVE TOUR 2026 “Exitus” Taipei DAY2 Milestone and venue photo",
      "Added #Exitus_TAIPEI and #AveMujica links with safer localized image descriptions",
    ],
  },
  {
    path: "/ja/",
    lang: "ja",
    status: "🟢 更新中",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "Tier Maker のティア表と Unsorted セクションの間隔と視覚的な区切りを改善",
      "Contact のメール代替リンクから Gmail の新規メール作成画面を開き、contact@huihui.dev を宛先に設定",
      "Ave Mujica LIVE TOUR 2026「Exitus」台北公演 DAY2 の多言語 Milestone と会場写真を追加",
      "#Exitus_TAIPEI／#AveMujica リンクと、安全な多言語画像説明を追加",
    ],
  },
];

async function observeIntervals(page) {
  await page.addInitScript(() => {
    const nativeSetInterval = window.setInterval;

    window.__intervalObservations = [];
    window.setInterval = function instrumentedSetInterval(
      callback,
      delay,
      ...args
    ) {
      window.__intervalObservations.push({
        callback:
          typeof callback === "function"
            ? callback.name || "<anonymous>"
            : String(callback),
        delay: Number(delay),
        creationCount: window.__intervalObservations.length + 1,
      });

      return nativeSetInterval.call(this, callback, delay, ...args);
    };
  });
}

async function stubHomeApis(page) {
  const fulfill = (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body =
      pathname === "/api/tech-news"
        ? {
            ok: true,
            techNews: [
              {
                category: "AI",
                title: "Deterministic Home regression fixture",
                source: "Test Source",
                timeAgo: "just now",
                tag: "Test",
                link: "https://example.test/home-regression",
              },
            ],
          }
        : null;

    return route.fulfill({
      status: body ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(body || { ok: false }),
    });
  };

  await page.route("https://api.huihui.dev/**", fulfill);
  await page.route(
    "https://huihui-api-beta.huihuigames01.workers.dev/**",
    fulfill,
  );
}

for (const route of homeRoutes) {
  test(`${route.path} keeps live cards without obsolete requests or timers`, async ({
    page,
  }) => {
    const apiRequests = [];
    const consoleErrors = [];
    const localFailures = [];
    const pageErrors = [];

    page.on("request", (request) => {
      const url = new URL(request.url());

      if (apiOrigins.has(url.origin)) apiRequests.push(url.pathname);
    });
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

    await observeIntervals(page);
    await stubHomeApis(page);

    const response = await page.goto(route.path, { waitUntil: "load" });
    const main = page.locator("main.main");
    const releaseCard = main.locator(".website-version-section .apod-card");
    const techCard = main.locator("#techNewsCards > .tech-news-card");

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
    await expect(main.locator("h1")).toHaveText("huihui.dev");
    await expect(main.locator(".project-update-card h2")).toHaveText(
      route.status,
    );
    await expect(releaseCard.locator("h2")).toHaveText("v1.3.1");
    await expect(releaseCard.locator(".version-badge")).toHaveText(
      "Stable release",
    );
    await expect(releaseCard.locator(".version-badge")).not.toHaveText(
      "Release candidate",
    );
    await expect(releaseCard.locator(".release-notes li")).toHaveText(
      route.releaseNotes,
    );
    await expect(techCard).toHaveCount(1);
    await expect(techCard).toHaveAttribute(
      "href",
      "https://example.test/home-regression",
    );
    await expect(techCard).toHaveAttribute("rel", "noopener noreferrer");

    const languageLinks = page.locator("#site-sidebar .lang-switch a");
    await expect(languageLinks).toHaveCount(route.languagePaths.length);
    for (const [index, path] of route.languagePaths.entries()) {
      await expect(languageLinks.nth(index)).toHaveAttribute("href", path);
    }
    await expect(
      page.locator('#site-sidebar nav a[aria-current="page"]'),
    ).toHaveCount(0);

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      document:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }));
    const intervalObservations = await page.evaluate(
      () => window.__intervalObservations,
    );

    expect(overflow.body).toBeLessThanOrEqual(0);
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(apiRequests).toEqual(["/api/tech-news"]);
    expect(
      intervalObservations.filter(({ delay }) => delay === 300000),
    ).toHaveLength(0);
    expect(
      intervalObservations.filter(({ callback }) =>
        /load(?:ApodCard|ProjectUpdateCard)/.test(callback),
      ),
    ).toHaveLength(0);
    expect(consoleErrors).toEqual([]);
    expect(localFailures).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
