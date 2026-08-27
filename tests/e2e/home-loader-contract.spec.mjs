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
      "導入根頁面 OverlayScrollbars，並維持原生鍵盤、歷史紀錄與重新載入捲動還原",
      "新增行動版頁首／頁尾捲動控制，改善 skip link、安全區域與鍵盤導覽體驗",
      "重製 About 的 VS Code 個人檔案互動，完善響應式版面、鍵盤操作與減少動態效果支援",
      "新增全站 favicon 與首頁靜態識別，並強化 Cloudflare Pages 精確 SHA 同步及分層 smoke 驗證",
    ],
  },
  {
    path: "/en/",
    lang: "en",
    status: "🟢 Active",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "Added root-page OverlayScrollbars while preserving native keyboard, history, and reload scroll restoration",
      "Added mobile top/bottom scroll controls with improved skip-link, safe-area, and keyboard navigation behavior",
      "Rebuilt the About VS Code profile interaction with responsive layout, keyboard support, and reduced-motion behavior",
      "Added site-wide favicons and static Home identity while strengthening exact-SHA Cloudflare Pages synchronization and layered smoke verification",
    ],
  },
  {
    path: "/ja/",
    lang: "ja",
    status: "🟢 更新中",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "ルートページに OverlayScrollbars を導入し、ネイティブのキーボード操作、履歴、再読み込み時のスクロール復元を維持",
      "モバイル向けのページ先頭／末尾スクロール操作を追加し、スキップリンク、セーフエリア、キーボードナビゲーションを改善",
      "About の VS Code プロフィール操作を刷新し、レスポンシブ表示、キーボード操作、視差効果を減らす設定に対応",
      "サイト全体の favicon と Home の静的識別表示を追加し、Cloudflare Pages の正確な SHA 同期と段階別 smoke 検証を強化",
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
        : pathname === "/api/infrastructure-status"
          ? { ok: true, providers: [] }
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
    const infrastructureCards = main.locator(
      ".infrastructure-status-card",
    );

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
    await expect(main.locator("h1")).toHaveText("huihui.dev");
    await expect(main.locator(".project-update-card h2")).toHaveText(
      route.status,
    );
    await expect(releaseCard.locator("h2")).toHaveText("v1.5.0");
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
    await expect(infrastructureCards).toHaveCount(2);

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
    expect(apiRequests).toEqual([
      "/api/tech-news",
      "/api/infrastructure-status",
    ]);
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
