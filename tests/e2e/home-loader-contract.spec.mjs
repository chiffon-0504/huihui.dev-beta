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
      "強化 Cloudflare Worker API 的 HTTP、安全性與請求／回應大小限制",
      "改善 Works 與 Milestones 的響應式圖片載入，並精簡各頁腳本與語系資源",
      "完善三語介面、導覽、狀態訊息與鍵盤操作的無障礙支援",
      "升級 CI／Nightly regression 與跨瀏覽器測試，Chromium、Firefox 與 Playwright WebKit 全面通過",
    ],
  },
  {
    path: "/en/",
    lang: "en",
    status: "🟢 Active",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "Hardened Cloudflare Worker API HTTP contracts, security checks, and request/response size limits",
      "Improved responsive image delivery for Works and Milestones while reducing route-specific scripts and locale payloads",
      "Expanded multilingual accessibility across navigation, status messaging, and keyboard interaction",
      "Upgraded CI, nightly regression, and cross-browser coverage with Chromium, Firefox, and Playwright WebKit fully passing",
    ],
  },
  {
    path: "/ja/",
    lang: "ja",
    status: "🟢 更新中",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "Cloudflare Worker API の HTTP 契約、セキュリティ検証、リクエスト／レスポンスのサイズ制限を強化",
      "Works と Milestones のレスポンシブ画像配信を改善し、ページ別スクリプトとロケール資源を軽量化",
      "ナビゲーション、状態表示、キーボード操作を含む多言語アクセシビリティを改善",
      "CI／Nightly regression とクロスブラウザ検証を強化し、Chromium、Firefox、Playwright WebKit ですべて通過",
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
    await expect(releaseCard.locator("h2")).toHaveText("v1.4.0");
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
