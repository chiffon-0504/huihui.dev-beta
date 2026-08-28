import { expect, test } from "@playwright/test";
import { systemStatusFixture } from "../support/system-status.mjs";

const infrastructureApiUrl =
  "https://api.huihui.dev/api/infrastructure-status";
const techNewsApiUrl = "https://api.huihui.dev/api/tech-news";
const systemStatusApiUrl = "https://api.huihui.dev/api/system-status";
const expectedStatusSurface = "rgba(255, 255, 255, 0.26)";
const expectedStatusBorder = "rgba(255, 255, 255, 0.32)";
const expectedStatusBackdropFilter = "blur(18px) saturate(1.35)";
const expectedStatusBoxShadow =
  "rgba(255, 255, 255, 0.38) 0px 1px 0px 0px inset, rgba(80, 140, 210, 0.08) 0px 8px 22px 0px";
const expectedStatusColors = {
  operational: "rgb(11, 105, 56)",
  under_maintenance: "rgb(91, 63, 140)",
  degraded_performance: "rgb(122, 74, 0)",
  partial_outage: "rgb(154, 63, 0)",
  major_outage: "rgb(161, 31, 47)",
  unknown: "rgb(77, 86, 101)",
};
const expectedStatusLinkColor = "rgb(23, 79, 120)";
const representativeStatusBackgrounds = [
  { context: "Home Hero light/cyan", color: "#eef8ff" },
  // Strongest Hero cyan radial composited over the desktop blue body stop.
  { context: "Home Hero stronger blue", color: "#b2e5ff" },
  { context: "Cloudflare card", color: "#d9efff" },
  { context: "GitHub card", color: "#f4f0ff" },
  { context: "mobile status layout", color: "#dcebfb" },
];
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

function parseCssColor(value) {
  if (value.startsWith("#")) {
    return {
      red: Number.parseInt(value.slice(1, 3), 16),
      green: Number.parseInt(value.slice(3, 5), 16),
      blue: Number.parseInt(value.slice(5, 7), 16),
      alpha: 1,
    };
  }

  const channels = value.match(/[\d.]+/g).map(Number);
  return {
    red: channels[0],
    green: channels[1],
    blue: channels[2],
    alpha: channels[3] ?? 1,
  };
}

function compositeColor(foreground, background) {
  return {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green:
      foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    alpha: 1,
  };
}

function contrastRatio(foreground, background) {
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
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

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

    if (url === systemStatusApiUrl) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(systemStatusFixture()),
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
      .locator(".status-chip")
      .allTextContents();
    for (const status of locale.statuses) {
      expect(visibleStatuses.some((value) => value.includes(status))).toBe(true);
    }

    const statusContracts = await section
      .locator(".status-chip")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          state: element.dataset.status,
          text: element.textContent.trim(),
          symbol: element.querySelector(".status-symbol")?.textContent,
          symbolHidden:
            element.querySelector(".status-symbol")?.getAttribute(
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
    expect(new Set(statusContracts.map(({ state }) => state))).toEqual(
      new Set([
        "operational",
        "under_maintenance",
        "degraded_performance",
        "partial_outage",
        "major_outage",
        "unknown",
      ]),
    );
    await expect(
      cards.locator(".infrastructure-provider-summary > .status-chip"),
    ).toHaveCount(2);

    const links = cards.locator(".infrastructure-status-link.status-link");
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
    expect(requests).toEqual([
      "/api/system-status",
      "/api/tech-news",
      "/api/infrastructure-status",
    ]);
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

test("System and Infrastructure component chips use identical computed tokens", async ({
  page,
}) => {
  await stubHomeDependencies(page, { providers: allStatesFixture() });

  const readChipTokens = (chip) => {
    const style = getComputedStyle(chip);
    const symbolStyle = getComputedStyle(chip.querySelector(".status-symbol"));
    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: style.fontWeight,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      borderRadius: style.borderRadius,
      gap: style.gap,
      borderTopWidth: style.borderTopWidth,
      borderTopStyle: style.borderTopStyle,
      borderTopColor: style.borderTopColor,
      backgroundColor: style.backgroundColor,
      backdropFilter: style.backdropFilter,
      boxShadow: style.boxShadow,
      symbolFontSize: symbolStyle.fontSize,
    };
  };

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/en/", { waitUntil: "load" });

    const systemTokens = await page
      .locator(".system-status-state.status-chip")
      .first()
      .evaluate(readChipTokens);
    const infrastructureTokens = await page
      .locator(".infrastructure-component-status.status-chip")
      .first()
      .evaluate(readChipTokens);

    expect(infrastructureTokens).toEqual(systemTokens);
    expect(systemTokens).toEqual({
      fontSize: "13.12px",
      lineHeight: "17.712px",
      fontWeight: "700",
      paddingTop: "3px",
      paddingRight: "9px",
      paddingBottom: "3px",
      paddingLeft: "9px",
      borderRadius: "999px",
      gap: "6px",
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: expectedStatusBorder,
      backgroundColor: expectedStatusSurface,
      backdropFilter: expectedStatusBackdropFilter,
      boxShadow: expectedStatusBoxShadow,
      symbolFontSize: "11.52px",
    });
    await expectNoHorizontalOverflow(page);
  }
});

test("shared status chips and links use translucent glass with WCAG AA composite contrast", async ({
  page,
}) => {
  await stubHomeDependencies(page, { providers: allStatesFixture() });
  await page.goto("/en/", { waitUntil: "load" });

  const statusSurfaces = await page
    .locator("body")
    .evaluate((body) =>
      [...body.querySelectorAll(".status-chip, .status-link")].map((element) => {
        const style = getComputedStyle(element);
        return {
          backdropFilter: style.backdropFilter,
          backgroundColor: style.backgroundColor,
          classes: element.className,
          color: style.color,
          label: element.textContent.trim(),
          state: element.dataset.status || null,
        };
      }),
    );

  expect(statusSurfaces.length).toBeGreaterThan(0);
  expect(
    statusSurfaces.every(
      ({ backgroundColor }) => backgroundColor === expectedStatusSurface,
    ),
  ).toBe(true);
  expect(
    statusSurfaces.every(
      ({ backdropFilter }) => backdropFilter === expectedStatusBackdropFilter,
    ),
  ).toBe(true);

  const glassOverlay = parseCssColor(expectedStatusSurface);
  expect(glassOverlay.alpha).toBe(0.26);
  for (const surface of statusSurfaces) {
    const foreground = parseCssColor(surface.color);
    for (const background of representativeStatusBackgrounds) {
      const composite = compositeColor(
        glassOverlay,
        parseCssColor(background.color),
      );
      expect(
        contrastRatio(foreground, composite),
        `${surface.label} on ${background.context}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
  for (const [state, color] of Object.entries(expectedStatusColors)) {
    expect(
      statusSurfaces.some(
        (result) => result.state === state && result.color === color,
      ),
    ).toBe(true);
  }
  expect(
    statusSurfaces
      .filter(({ classes }) => classes.includes("status-link"))
      .every(({ color }) => color === expectedStatusLinkColor),
  ).toBe(true);
  for (const className of [
    "system-status-state",
    "system-status-link",
    "infrastructure-component-status",
    "infrastructure-status-link",
  ]) {
    expect(
      statusSurfaces.some(({ classes }) => classes.includes(className)),
    ).toBe(true);
  }
});

test("shared status links use identical glass interactive treatment", async ({
  page,
}) => {
  await stubHomeDependencies(page);
  await page.goto("/en/", { waitUntil: "load" });

  const linkTokens = await page.locator(".status-link").evaluateAll((links) =>
    links.map((link) => {
      const style = getComputedStyle(link);
      return {
        backgroundColor: style.backgroundColor,
        backdropFilter: style.backdropFilter,
        borderColor: style.borderTopColor,
        borderRadius: style.borderRadius,
        borderStyle: style.borderTopStyle,
        borderWidth: style.borderTopWidth,
        color: style.color,
        boxShadow: style.boxShadow,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        padding: [
          style.paddingTop,
          style.paddingRight,
          style.paddingBottom,
          style.paddingLeft,
        ],
        textDecorationLine: style.textDecorationLine,
      };
    }),
  );

  expect(linkTokens).toHaveLength(3);
  expect(new Set(linkTokens.map((tokens) => JSON.stringify(tokens))).size).toBe(1);
  expect(linkTokens[0]).toEqual({
    backgroundColor: expectedStatusSurface,
    backdropFilter: expectedStatusBackdropFilter,
    borderColor: expectedStatusBorder,
    borderRadius: "10px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: expectedStatusLinkColor,
    boxShadow: expectedStatusBoxShadow,
    fontSize: "13.12px",
    fontWeight: "700",
    lineHeight: "18.368px",
    padding: ["5px", "9px", "5px", "9px"],
    textDecorationLine: "underline",
  });

  for (const link of await page.locator(".status-link").all()) {
    await link.hover();
    await expect(link).toHaveCSS(
      "background-color",
      "rgba(255, 255, 255, 0.34)",
    );
    await expect(link).toHaveCSS(
      "border-top-color",
      "rgba(255, 255, 255, 0.48)",
    );
    await link.focus();
    await expect(link).toBeFocused();
    expect(
      await link.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe("none");
  }
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
          ".status-chip, .status-link",
        ),
      ].map((element) => getComputedStyle(element).color);
      const statusBackgrounds = [
        ...section.querySelectorAll(
          ".status-chip, .status-link",
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
