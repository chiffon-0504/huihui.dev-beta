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
      "修正 Contact 表單輸入長度限制，使前端與 Worker 驗證一致。",
      "修正 Tier Maker 首次匯出模組載入失敗後無法正常恢復的問題。",
      "強化 CSP、Tier Maker 匯出、Lightbox 與 vendor provenance 等自動化驗證。",
    ],
  },
  {
    path: "/en/",
    lang: "en",
    status: "All Systems Operational",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "Fixed Contact form input limits so browser-side constraints match Worker validation.",
      "Fixed Tier Maker export recovery after an initial module loading failure.",
      "Strengthened automated CSP, Tier Maker export, Lightbox, and vendor provenance validation.",
    ],
  },
  {
    path: "/ja/",
    lang: "ja",
    status: "すべてのシステムが正常稼働中",
    languagePaths: ["/", "/en/", "/ja/"],
    releaseNotes: [
      "Contact フォームの入力文字数制限を修正し、ブラウザー側の制限を Worker の検証と一致させました。",
      "Tier Maker で初回のエクスポート用モジュールの読み込みに失敗した後、再試行で復旧できない問題を修正しました。",
      "CSP、Tier Maker のエクスポート、Lightbox、vendor provenance に関する自動検証を強化しました。",
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
    await expect(releaseCard.locator("h2")).toHaveText("v1.6.2");
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
