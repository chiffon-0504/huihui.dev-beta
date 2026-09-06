import { expect, test } from "@playwright/test";

const apiOrigins = new Set([
  "https://api.huihui.dev",
  "https://huihui-api-beta.huihuigames01.workers.dev",
]);
const homeRoutes = [
  {
    path: "/",
    lang: "zh-Hant",
    status: "全部系統運作正常",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "新增 Infrastructure Status 與完整 System Status，提供 Website／API／Contact 即時健康狀態、Cloudflare／GitHub 基礎設施狀態，以及 Better Stack 可用性與事件歷史",
      "Tech Updates 改用 OpenAI、Anthropic 與 Apple Developer 官方來源，並加入本地化相對時間",
      "Contact 新增 Subject 欄位，改善 timeout、錯誤復原與舊格式送出相容性",
      "強化 Worker 上游驗證、fail-closed 行為、結構化 diagnostics 與狀態來源穩定性",
      "改善 Status UI、文字選取對比、About accessibility，以及 Works／About／Arcaea 媒體內容",
    ],
  },
  {
    path: "/en/",
    lang: "en",
    status: "All Systems Operational",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "Added Infrastructure Status and expanded System Status with current Website/API/Contact health, Cloudflare/GitHub infrastructure status, and Better Stack availability and incident history",
      "Updated Tech Updates to official OpenAI, Anthropic, and Apple Developer sources with localized relative times",
      "Added a Contact Subject field and improved timeout handling, recovery, and legacy submission compatibility",
      "Strengthened upstream validation, fail-closed Worker behavior, structured diagnostics, and status-source reliability",
      "Refined Status UI, text-selection contrast, About accessibility, and Works/About/Arcaea media content",
    ],
  },
  {
    path: "/ja/",
    lang: "ja",
    status: "すべてのシステムが正常稼働中",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "Infrastructure Status と System Status を拡充し、Website／API／Contact の現在のヘルス、Cloudflare／GitHub のインフラ状態、Better Stack の可用性・インシデント履歴を追加",
      "Tech Updates を OpenAI、Anthropic、Apple Developer の公式ソースへ更新し、ローカライズされた相対時刻を追加",
      "Contact に Subject フィールドを追加し、タイムアウト、復旧処理、旧形式送信との互換性を改善",
      "上流検証、fail-closed な Worker 動作、構造化 diagnostics、status source の安定性を強化",
      "Status UI、文字選択のコントラスト、About accessibility、Works／About／Arcaea のメディアを改善",
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
    await expect(main.locator(".project-update-card h2")).toContainText(
      route.status,
    );
    await expect(releaseCard.locator("h2")).toHaveText("v1.6.0");
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
      "/api/system-status",
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
