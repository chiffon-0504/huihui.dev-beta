import { expect, test } from "@playwright/test";

const infrastructureApiUrl =
  "https://api.huihui.dev/api/infrastructure-status";
const techNewsApiUrl = "https://api.huihui.dev/api/tech-news";
const locales = [
  {
    name: "ZH",
    path: "/",
    title: "基礎設施狀態",
    loading: "正在載入基礎設施狀態……",
    loadError: "無法載入基礎設施狀態。",
    cloudflareTitle: "Cloudflare 狀態",
    githubTitle: "GitHub 狀態",
    statuses: ["營運正常", "維護中", "效能下降", "部分中斷", "重大中斷", "未知"],
  },
  {
    name: "EN",
    path: "/en/",
    title: "Infrastructure Status",
    loading: "Loading infrastructure status…",
    loadError: "Unable to load infrastructure status.",
    cloudflareTitle: "Cloudflare Status",
    githubTitle: "GitHub Status",
    statuses: [
      "Operational",
      "Under Maintenance",
      "Degraded Performance",
      "Partial Outage",
      "Major Outage",
      "Unknown",
    ],
  },
  {
    name: "JA",
    path: "/ja/",
    title: "インフラストラクチャ状況",
    loading: "インフラストラクチャ状況を読み込んでいます……",
    loadError: "インフラストラクチャ状況を読み込めませんでした。",
    cloudflareTitle: "Cloudflare ステータス",
    githubTitle: "GitHub ステータス",
    statuses: ["正常稼働", "メンテナンス中", "パフォーマンス低下", "一部停止", "重大な障害", "不明"],
  },
];

function providerFixtures({ cloudflare = {}, github = {} } = {}) {
  return [
    {
      id: "cloudflare",
      name: cloudflare.name || "Cloudflare",
      status: cloudflare.status || "operational",
      url: cloudflare.url || "https://malicious.example/cloudflare",
      components: [
        { id: "pages", name: "Untrusted Pages", status: cloudflare.pages || "operational" },
        { id: "workers", name: "Untrusted Workers", status: cloudflare.workers || "operational" },
        { id: "dns", name: "Untrusted DNS", status: cloudflare.dns || "operational" },
        { id: "cdn", name: "Untrusted CDN", status: cloudflare.cdn || "operational" },
      ],
    },
    {
      id: "github",
      name: github.name || "GitHub",
      status: github.status || "operational",
      url: github.url || "javascript:alert(1)",
      components: [
        { id: "actions", name: "Untrusted Actions", status: github.actions || "operational" },
        { id: "api_requests", name: "Untrusted API", status: github.apiRequests || "operational" },
        { id: "git_operations", name: "Untrusted Git", status: github.gitOperations || "operational" },
      ],
    },
  ];
}

function allStatesFixture() {
  return providerFixtures({
    cloudflare: {
      name: '<img src=x onerror="window.__statusPayloadRan=true">',
      status: "major_outage",
      pages: "operational",
      workers: "under_maintenance",
      dns: "degraded_performance",
      cdn: "partial_outage",
    },
    github: {
      name: "<script>window.__statusPayloadRan=true</script>",
      status: "unknown",
      actions: "unknown",
      apiRequests: "unknown",
      gitOperations: "unknown",
    },
  });
}

function techNewsFixture() {
  return {
    ok: true,
    techNews: [
      {
        category: "OpenAI",
        title: "Tech Updates fixture",
        source: "OpenAI News",
        timeAgo: "now",
        tag: "News",
        link: "https://openai.com/news/",
      },
    ],
  };
}

async function stubHomeDependencies(
  page,
  { providers = providerFixtures(), infrastructureStatus = 200, gate } = {},
) {
  const requests = [];

  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );
  await page.route("https://api.huihui.dev/**", async (route) => {
    const url = route.request().url();
    requests.push(new URL(url).pathname);

    if (url === techNewsApiUrl) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(techNewsFixture()),
      });
      return;
    }

    if (url === infrastructureApiUrl) {
      await gate;
      await route.fulfill({
        status: infrastructureStatus,
        contentType: "application/json",
        body: JSON.stringify({
          ok: infrastructureStatus === 200,
          providers,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false }),
    });
  });

  return requests;
}

async function expectNoHorizontalOverflow(page) {
  const geometry = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    client: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    cards: [...document.querySelectorAll(".infrastructure-status-card")].map(
      (card) => ({ client: card.clientWidth, scroll: card.scrollWidth }),
    ),
  }));

  expect(geometry.body).toBeLessThanOrEqual(geometry.client + 1);
  expect(geometry.document).toBeLessThanOrEqual(geometry.client + 1);
  expect(
    geometry.cards.every((card) => card.scroll <= card.client + 1),
  ).toBe(true);
}

for (const locale of locales) {
  test(`${locale.name} renders two safe, localized provider cards with every textual state`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__statusPayloadRan = false;
    });
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const requests = await stubHomeDependencies(page, {
      providers: allStatesFixture(),
    });

    const response = await page.goto(locale.path, { waitUntil: "load" });
    expect(response?.status()).toBe(200);

    const section = page.locator(".infrastructure-status-section");
    const cards = section.locator(":scope .infrastructure-status-card");
    await expect(section.getByRole("heading", { level: 2 })).toHaveText(
      locale.title,
    );
    await expect(cards).toHaveCount(2);
    await expect(cards.locator("h3")).toHaveText([
      locale.cloudflareTitle,
      locale.githubTitle,
    ]);
    await expect(cards.nth(0).locator("dt")).toHaveText([
      "Pages",
      "Workers",
      "DNS",
      "CDN",
    ]);
    await expect(cards.nth(1).locator("dt")).toHaveText(
      locale.name === "ZH"
        ? ["Actions", "API 請求", "Git 操作"]
        : locale.name === "JA"
          ? ["Actions", "APIリクエスト", "Git操作"]
          : ["Actions", "API Requests", "Git Operations"],
    );

    const visibleStatuses = await section
      .locator(
        ".infrastructure-status-text, .infrastructure-component-status",
      )
      .allTextContents();
    for (const status of locale.statuses) {
      expect(visibleStatuses.some((value) => value.includes(status))).toBe(true);
    }

    const statusContracts = await section
      .locator(
        ".infrastructure-status-text, .infrastructure-component-status",
      )
      .evaluateAll((elements) =>
        elements.map((element) => ({
          state: element.dataset.status,
          text: element.textContent.trim(),
          symbol: element.querySelector(".infrastructure-status-symbol")?.textContent,
          symbolHidden:
            element.querySelector(".infrastructure-status-symbol")?.getAttribute(
              "aria-hidden",
            ),
        })),
      );
    expect(
      statusContracts.every(
        (contract) =>
          contract.state && contract.text && contract.symbolHidden === "true",
      ),
    ).toBe(true);
    expect(statusContracts).toContainEqual(
      expect.objectContaining({
        state: "under_maintenance",
        symbol: "◆",
      }),
    );

    const links = cards.locator(".infrastructure-status-link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute(
      "href",
      "https://www.cloudflarestatus.com/",
    );
    await expect(links.nth(1)).toHaveAttribute(
      "href",
      "https://www.githubstatus.com/",
    );
    await expect(links.nth(0)).toHaveAttribute("target", "_blank");
    await expect(links.nth(1)).toHaveAttribute("rel", "noopener noreferrer");
    await links.nth(0).focus();
    await expect(links.nth(0)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(links.nth(1)).toBeFocused();

    await expect(section.locator("img, script, svg")).toHaveCount(0);
    expect(await page.evaluate(() => window.__statusPayloadRan)).toBe(false);
    expect(
      await page.evaluate(() => {
        const tech = document.querySelector(".tech-news-section:not(.infrastructure-status-section)");
        const infrastructure = document.querySelector(
          ".infrastructure-status-section",
        );
        return Boolean(
          tech.compareDocumentPosition(infrastructure) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);
    await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(1);
    expect(requests).toEqual(["/api/tech-news", "/api/infrastructure-status"]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900, columns: 2, path: "/en/" },
  { name: "mobile", width: 390, height: 844, columns: 1, path: "/ja/" },
]) {
  test(`${viewport.name} uses the expected Infrastructure Status layout without overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await stubHomeDependencies(page);
    await page.goto(viewport.path, { waitUntil: "load" });

    const grid = page.locator(".infrastructure-status-grid");
    await expect(grid.locator(":scope > .infrastructure-status-card")).toHaveCount(
      2,
    );
    const columns = await grid.evaluate((element) =>
      getComputedStyle(element)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length,
    );
    expect(columns).toBe(viewport.columns);
    await expectNoHorizontalOverflow(page);
  });
}

test("one missing provider becomes Unknown without hiding the healthy provider", async ({
  page,
}) => {
  await stubHomeDependencies(page, {
    providers: providerFixtures().filter((provider) => provider.id === "github"),
  });
  await page.goto("/en/", { waitUntil: "load" });

  const cloudflare = page.locator(
    '.infrastructure-status-card[data-provider="cloudflare"]',
  );
  const github = page.locator(
    '.infrastructure-status-card[data-provider="github"]',
  );
  await expect(cloudflare).toHaveAttribute("data-status", "unknown");
  await expect(cloudflare.locator(".infrastructure-provider-summary")).toContainText(
    "Unknown",
  );
  await expect(github).toHaveAttribute("data-status", "operational");
  await expect(github.locator(".infrastructure-provider-summary")).toContainText(
    "Operational",
  );
});

test("maintenance renders explicitly while degraded remains the mixed worst state", async ({
  page,
}) => {
  await stubHomeDependencies(page, {
    providers: providerFixtures({
      cloudflare: {
        status: "degraded_performance",
        pages: "under_maintenance",
        workers: "degraded_performance",
      },
    }),
  });
  await page.goto("/en/", { waitUntil: "load" });

  const cloudflare = page.locator(
    '.infrastructure-status-card[data-provider="cloudflare"]',
  );
  await expect(cloudflare).toHaveAttribute("data-status", "degraded_performance");
  await expect(cloudflare.locator(".infrastructure-provider-summary")).toContainText(
    "Degraded Performance",
  );
  await expect(
    cloudflare.locator('.infrastructure-component-status[data-status="under_maintenance"]'),
  ).toContainText("Under Maintenance");
});

test("default status and provider-link colors meet WCAG AA contrast", async ({
  page,
}) => {
  await stubHomeDependencies(page, { providers: allStatesFixture() });
  await page.goto("/en/", { waitUntil: "load" });

  const contrastResults = await page
    .locator(".infrastructure-status-section")
    .evaluate((section) => {
      const parseColor = (value) => {
        const channels = value.match(/[\d.]+/g).map(Number);
        return {
          red: channels[0],
          green: channels[1],
          blue: channels[2],
          alpha: channels[3] ?? 1,
        };
      };
      const luminance = (color) => {
        const linearize = (channel) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        };
        return (
          0.2126 * linearize(color.red) +
          0.7152 * linearize(color.green) +
          0.0722 * linearize(color.blue)
        );
      };
      const contrastRatio = (foreground, background) => {
        const foregroundLuminance = luminance(foreground);
        const backgroundLuminance = luminance(background);
        return (
          (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
          (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
        );
      };
      return [
        ...section.querySelectorAll(
          ".infrastructure-status-text, .infrastructure-component-status, .infrastructure-status-link",
        ),
      ].map((element) => {
        const foreground = parseColor(getComputedStyle(element).color);
        const background = parseColor(getComputedStyle(element).backgroundColor);

        return {
          backgroundAlpha: background.alpha,
          label: element.textContent.trim(),
          ratio: contrastRatio(foreground, background),
        };
      });
    });

  expect(contrastResults.length).toBeGreaterThan(0);
  expect(contrastResults.every(({ backgroundAlpha }) => backgroundAlpha === 1)).toBe(
    true,
  );
  expect(contrastResults.every(({ ratio }) => ratio >= 4.5)).toBe(true);
});

test("a request failure replaces loading with an accessible error and two Unknown cards", async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await stubHomeDependencies(page, { gate, infrastructureStatus: 503 });
  await page.goto("/en/", { waitUntil: "domcontentloaded" });

  const loading = page.locator(
    '[data-infrastructure-status-state="loading"]',
  );
  await expect(loading).toHaveText(locales[1].loading);
  await expect(loading).toHaveAttribute("role", "status");
  await expect(loading).toHaveAttribute("aria-live", "polite");

  release();
  const error = page.locator('[data-infrastructure-status-state="error"]');
  await expect(error).toHaveText(locales[1].loadError);
  await expect(error).toHaveAttribute("aria-atomic", "true");
  const cards = page.locator(".infrastructure-status-card");
  await expect(cards).toHaveCount(2);
  expect(await cards.evaluateAll((items) => items.map((item) => item.dataset.status))).toEqual([
    "unknown",
    "unknown",
  ]);
});

test("forced-colors keeps status text, card boundaries, and links understandable", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  await stubHomeDependencies(page);
  await page.goto("/en/", { waitUntil: "load" });

  const forcedColors = await page.locator(".infrastructure-status-section").evaluate(
    (section) => {
      const sample = document.createElement("span");
      sample.style.color = "CanvasText";
      document.body.append(sample);
      const canvasText = getComputedStyle(sample).color;
      sample.remove();
      const card = section.querySelector(".infrastructure-status-card");
      const status = section.querySelector(".infrastructure-status-text");
      const link = section.querySelector(".infrastructure-status-link");

      const statusColors = [
        ...section.querySelectorAll(
          ".infrastructure-status-text, .infrastructure-component-status, .infrastructure-status-link",
        ),
      ].map((element) => getComputedStyle(element).color);
      const statusBackgrounds = [
        ...section.querySelectorAll(
          ".infrastructure-status-text, .infrastructure-component-status, .infrastructure-status-link",
        ),
      ].map((element) => getComputedStyle(element).backgroundColor);

      const canvas = document.createElement("span");
      canvas.style.backgroundColor = "Canvas";
      document.body.append(canvas);
      const canvasBackground = getComputedStyle(canvas).backgroundColor;
      canvas.remove();

      return {
        active: matchMedia("(forced-colors: active)").matches,
        borderStyle: getComputedStyle(card).borderStyle,
        linkText: link.textContent.trim(),
        statusColor: getComputedStyle(status).color,
        statusText: status.textContent.trim(),
        canvasText,
        canvasBackground,
        statusColors,
        statusBackgrounds,
      };
    },
  );

  expect(forcedColors.active).toBe(true);
  expect(forcedColors.borderStyle).not.toBe("none");
  expect(forcedColors.statusColor).toBe(forcedColors.canvasText);
  expect(forcedColors.statusColors.every((color) => color === forcedColors.canvasText)).toBe(true);
  expect(
    forcedColors.statusBackgrounds.every(
      (background) => background === forcedColors.canvasBackground,
    ),
  ).toBe(true);
  expect(forcedColors.statusText).toContain("Operational");
  expect(forcedColors.linkText).toContain("Cloudflare Status");
});
