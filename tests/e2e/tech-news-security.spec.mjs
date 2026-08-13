import { expect, test } from "@playwright/test";

const TECH_NEWS_API_URL = "https://api.huihui.dev/api/tech-news";
const locales = [
  {
    name: "ZH",
    path: "/",
    loading: "載入科技動態中……",
    empty: "目前沒有科技動態。",
    error: "無法載入科技動態。",
    timeout: "科技動態載入逾時。",
    source: "來源：Fixture · now",
  },
  {
    name: "EN",
    path: "/en/",
    loading: "Loading tech updates…",
    empty: "No tech updates are available.",
    error: "Failed to load tech updates.",
    timeout: "Tech updates timed out.",
    source: "Source: Fixture · now",
  },
  {
    name: "JA",
    path: "/ja/",
    loading: "テクノロジー情報を読み込んでいます……",
    empty: "現在表示できるテクノロジー情報はありません。",
    error: "テクノロジー情報を読み込めませんでした。",
    timeout: "テクノロジー情報の読み込みがタイムアウトしました。",
    source: "出典：Fixture · now",
  },
];

function techNewsItem(overrides = {}) {
  return {
    category: "AI",
    title: "Deterministic fixture",
    source: "Fixture",
    timeAgo: "now",
    tag: "Test",
    link: "https://example.test/tech-news",
    ...overrides,
  };
}

async function stubHomeDependencies(
  page,
  { techNews = [], techNewsStatus = 200, techNewsGate, handleTechNews } = {},
) {
  let techNewsRequestCount = 0;

  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );

  await page.route(
    "https://api.huihui.dev/**",
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;

      if (pathname === "/api/tech-news") {
        techNewsRequestCount += 1;

        if (handleTechNews) {
          await handleTechNews(route, techNewsRequestCount);
          return;
        }

        await techNewsGate;
        await route.fulfill({
          status: techNewsStatus,
          contentType: "application/json",
          body: JSON.stringify({ ok: techNewsStatus === 200, techNews }),
        });
        return;
      }

      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false }),
      });
    },
  );

  return () => techNewsRequestCount;
}

async function expectTechNewsStatus(page, state, text) {
  const status = page.locator(
    `#techNewsCards > .tech-news-status[data-tech-news-state="${state}"]`,
  );

  await expect(status).toHaveText(text);
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(page.locator("#techNewsCards > *")).toHaveCount(1);
  await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(0);
  await expect(page.locator("#techNewsCards [role='status']")).toHaveCount(1);
}

async function installControllableTechNewsFetch(page) {
  await page.addInitScript((apiUrl) => {
    const nativeFetch = window.fetch.bind(window);
    window.__techNewsAbortCount = 0;
    window.__techNewsFetchCount = 0;
    window.__techNewsResolvers = [];

    window.fetch = (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;

      if (url !== apiUrl) {
        return nativeFetch(input, init);
      }

      window.__techNewsFetchCount += 1;
      return new Promise((resolve) => {
        window.__techNewsResolvers.push(resolve);
        init.signal?.addEventListener(
          "abort",
          () => {
            window.__techNewsAbortCount += 1;
          },
          { once: true },
        );
      });
    };
  }, TECH_NEWS_API_URL);
}

async function resolveTechNewsRequest(
  page,
  { index, status = 200, body, jsonMarker },
) {
  await page.evaluate(
    ({ index, status, body, jsonMarker }) => {
      window.__techNewsResolvers[index]({
        ok: status >= 200 && status < 300,
        json: async () => {
          if (jsonMarker) window[jsonMarker] = true;
          return body;
        },
      });
    },
    { index, status, body, jsonMarker },
  );
}

async function getTechNewsLayout(page) {
  return page.locator("#techNewsCards").evaluate((grid) => {
    const gridStyle = getComputedStyle(grid);
    const card = grid.querySelector(".tech-news-card");
    const cardStyle = card ? getComputedStyle(card) : null;
    const beforeStyle = card ? getComputedStyle(card, "::before") : null;

    return {
      pageOverflows: document.documentElement.scrollWidth > window.innerWidth,
      gridOverflows: grid.scrollWidth > grid.clientWidth + 1,
      columns: gridStyle.gridTemplateColumns.split(" ").filter(Boolean).length,
      childCount: grid.children.length,
      cardCount: grid.querySelectorAll(":scope > .tech-news-card").length,
      statusCount: grid.querySelectorAll(":scope > .tech-news-status").length,
      material: cardStyle && beforeStyle
        ? {
            borderRadius: cardStyle.borderRadius,
            beforeContent: beforeStyle.content,
            backdropFilter:
              cardStyle.backdropFilter || cardStyle.webkitBackdropFilter || "",
            transitionDuration: cardStyle.transitionDuration,
          }
        : null,
    };
  });
}

function hasOnlyZeroDurations(value) {
  return value
    .split(",")
    .map((duration) => Number.parseFloat(duration))
    .every((duration) => duration === 0);
}

test("renders hostile feed values as text and only links HTTPS cards", async ({
  page,
}) => {
  const hostileTitle =
    '</h3><img src=x onerror="window.__techNewsPayloadRan=true">';
  const htmlTitle =
    "<script>window.__techNewsPayloadRan=true</script>";
  const hostileSource =
    '<svg onload="window.__techNewsPayloadRan=true">Hostile RSS</svg>';
  const validUrl = "https://example.test/articles/secure?from=rss#section";

  await page.addInitScript(() => {
    window.__techNewsPayloadRan = false;
  });
  await stubHomeDependencies(page, {
    techNews: [
      {
        category: "AI",
        title: hostileTitle,
        description: htmlTitle,
        source: hostileSource,
        timeAgo: "1 min ago",
        tag: "Security",
        link: "javascript:alert(1)",
      },
      {
        category: "Web",
        title: htmlTitle,
        source: "Malformed RSS",
        timeAgo: "",
        tag: "HTML",
        link: "://not a valid URL",
      },
      {
        category: "Transport",
        title: "Insecure HTTP article",
        description: hostileTitle,
        source: "Insecure RSS",
        timeAgo: "",
        tag: "HTTP",
        link: "http://example.test/insecure",
      },
      {
        category: "Platform",
        title: "Valid HTTPS article",
        source: "Safe RSS",
        timeAgo: "2 mins ago",
        tag: "HTTPS",
        link: validUrl,
      },
    ],
  });

  await page.goto("/", { waitUntil: "load" });

  const cards = page.locator("#techNewsCards > .tech-news-card");
  await expect(cards).toHaveCount(4);
  expect(await cards.nth(0).locator("h3").textContent()).toBe(hostileTitle);
  expect(await cards.nth(1).locator("h3").textContent()).toBe(htmlTitle);
  await expect(
    page.locator("#techNewsCards img, #techNewsCards script, #techNewsCards svg"),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.__techNewsPayloadRan)).toBe(false);

  expect(await cards.nth(0).getAttribute("href")).toBeNull();
  expect(await cards.nth(1).getAttribute("href")).toBeNull();
  expect(await cards.nth(2).getAttribute("href")).toBeNull();
  await expect(cards.nth(3)).toHaveAttribute("href", validUrl);
  await expect(cards.nth(3)).toHaveAttribute("target", "_blank");
  await expect(cards.nth(3)).toHaveAttribute("rel", "noopener noreferrer");
  expect(
    await page.locator("#techNewsCards > .tech-news-card[href]").evaluateAll((links) =>
      links.every((link) => new URL(link.href).protocol === "https:"),
    ),
  ).toBe(true);

  expect(
    await cards.nth(0).locator(":scope > *").evaluateAll((elements) =>
      elements.map((element) => ({
        tag: element.tagName,
        className: element.className,
      })),
    ),
  ).toEqual([
    { tag: "DIV", className: "tech-news-category" },
    { tag: "H3", className: "" },
    { tag: "P", className: "" },
    { tag: "SPAN", className: "tech-news-tag" },
  ]);
  await expect(cards.nth(0).locator("p")).toHaveText(
    `來源：${hostileSource} · 1 min ago`,
  );
});

test("preserves the loading and request-failure states", async ({ page }) => {
  let releaseTechNews;
  const techNewsGate = new Promise((resolve) => {
    releaseTechNews = resolve;
  });

  await stubHomeDependencies(page, { techNewsStatus: 500, techNewsGate });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#techNewsCards .tech-news-loading")).toHaveText(
    "載入科技動態中……",
  );

  releaseTechNews();
  await expect(page.locator("#techNewsCards .tech-news-error")).toHaveText(
    "無法載入科技動態。",
  );
  await expect(page.locator("#techNewsCards > *")).toHaveCount(1);
});

for (const locale of locales) {
  test(`${locale.name} localizes loading, populated cards, and the source label`, async ({
    page,
  }) => {
    let releaseTechNews;
    const techNewsGate = new Promise((resolve) => {
      releaseTechNews = resolve;
    });
    const getRequestCount = await stubHomeDependencies(page, {
      techNews: [techNewsItem()],
      techNewsGate,
    });

    const response = await page.goto(locale.path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expectTechNewsStatus(page, "loading", locale.loading);

    releaseTechNews();

    const cards = page.locator("#techNewsCards > .tech-news-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator("h3")).toHaveText("Deterministic fixture");
    await expect(cards.first().locator("p")).toHaveText(locale.source);
    await expect(cards.first()).toHaveAttribute("href", "https://example.test/tech-news");
    await expect(cards.first()).toHaveAttribute("target", "_blank");
    await expect(cards.first()).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.locator("#techNewsCards > .tech-news-status")).toHaveCount(0);
    await expect(page.locator("#techNewsCards [role='status']")).toHaveCount(0);
    expect(getRequestCount()).toBe(1);
  });
}

for (const locale of locales) {
  test(`${locale.name} distinguishes empty, invalid-only, and mixed arrays`, async ({
    page,
  }) => {
    const responses = [
      { ok: true, techNews: [] },
      {
        ok: true,
        techNews: [
          null,
          "invalid",
          [],
          { category: "AI", title: "", source: "Fixture", tag: "Test" },
          { category: "AI", title: "Missing tag", source: "Fixture" },
        ],
      },
      {
        ok: true,
        techNews: [
          null,
          { category: "AI", title: "", source: "Fixture", tag: "Test" },
          techNewsItem({ title: "Only valid item" }),
        ],
      },
    ];
    const getRequestCount = await stubHomeDependencies(page, {
      handleTechNews: (route, requestNumber) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(responses[requestNumber - 1]),
        }),
    });

    const response = await page.goto(locale.path, { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await expectTechNewsStatus(page, "empty", locale.empty);

    await page.evaluate(() => loadTechNews());
    await expectTechNewsStatus(page, "empty", locale.empty);

    await page.evaluate(() => loadTechNews());
    const cards = page.locator("#techNewsCards > .tech-news-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator("h3")).toHaveText("Only valid item");
    await expect(page.locator("#techNewsCards > .tech-news-status")).toHaveCount(0);
    expect(getRequestCount()).toBe(3);
  });
}

for (const locale of locales) {
  test(`${locale.name} localizes shape, JSON, HTTP, and network errors`, async ({
    page,
  }) => {
    const getRequestCount = await stubHomeDependencies(page, {
      handleTechNews: async (route, requestNumber) => {
        if (requestNumber === 1) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, techNews: [techNewsItem()] }),
          });
          return;
        }

        if (requestNumber === 2) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, techNews: {} }),
          });
          return;
        }

        if (requestNumber === 3) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "{malformed",
          });
          return;
        }

        if (requestNumber === 4) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ ok: false }),
          });
          return;
        }

        await route.abort("failed");
      },
    });

    const response = await page.goto(locale.path, { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(1);

    for (let requestNumber = 2; requestNumber <= 5; requestNumber += 1) {
      await page.evaluate(() => loadTechNews());
      await expectTechNewsStatus(page, "error", locale.error);
    }

    expect(getRequestCount()).toBe(5);
  });
}

for (const locale of locales) {
  test(`${locale.name} aborts on timeout and ignores a late success`, async ({
    page,
  }) => {
    await page.clock.install();
    const getInterceptedRequestCount = await stubHomeDependencies(page);
    await installControllableTechNewsFetch(page);

    const response = await page.goto(locale.path, { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await expectTechNewsStatus(page, "loading", locale.loading);

    const timeoutMs = await page.evaluate(() => TECH_NEWS_REQUEST_TIMEOUT_MS);
    await page.clock.fastForward(timeoutMs);

    await expectTechNewsStatus(page, "timeout", locale.timeout);
    expect(await page.evaluate(() => window.__techNewsFetchCount)).toBe(1);
    expect(await page.evaluate(() => window.__techNewsAbortCount)).toBe(1);

    await resolveTechNewsRequest(page, {
      index: 0,
      body: { ok: true, techNews: [techNewsItem({ title: "Late success" })] },
      jsonMarker: "__lateTechNewsJsonRead",
    });
    await expect
      .poll(() => page.evaluate(() => window.__lateTechNewsJsonRead))
      .toBe(true);

    await expectTechNewsStatus(page, "timeout", locale.timeout);
    expect(getInterceptedRequestCount()).toBe(0);
  });
}

test("repeated initialization does not duplicate requests, cards, or statuses", async ({
  page,
}) => {
  let releaseTechNews;
  const techNewsGate = new Promise((resolve) => {
    releaseTechNews = resolve;
  });
  const getRequestCount = await stubHomeDependencies(page, {
    techNews: [techNewsItem()],
    techNewsGate,
  });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expectTechNewsStatus(page, "loading", locales[0].loading);

  await page.evaluate(() => {
    initHomeCards();
    initHomeCards();
    initHomeCards();
  });

  await expect(page.locator("#techNewsCards > .tech-news-status")).toHaveCount(1);
  expect(getRequestCount()).toBe(1);

  releaseTechNews();
  await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(1);

  await page.evaluate(() => initHomeCards());
  await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(1);
  await expect(page.locator("#techNewsCards > .tech-news-status")).toHaveCount(0);
  expect(getRequestCount()).toBe(1);
});

test("a stale earlier success cannot overwrite a newer error", async ({ page }) => {
  const getInterceptedRequestCount = await stubHomeDependencies(page);
  await installControllableTechNewsFetch(page);

  const response = await page.goto("/en/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect
    .poll(() => page.evaluate(() => window.__techNewsFetchCount))
    .toBe(1);

  await page.evaluate(() => {
    void loadTechNews();
  });
  await expect
    .poll(() => page.evaluate(() => window.__techNewsFetchCount))
    .toBe(2);
  expect(await page.evaluate(() => window.__techNewsAbortCount)).toBe(1);

  await resolveTechNewsRequest(page, {
    index: 1,
    status: 500,
    body: { ok: false },
  });
  await expectTechNewsStatus(page, "error", locales[1].error);

  await resolveTechNewsRequest(page, {
    index: 0,
    body: { ok: true, techNews: [techNewsItem({ title: "Stale success" })] },
    jsonMarker: "__staleTechNewsJsonRead",
  });
  await expect
    .poll(() => page.evaluate(() => window.__staleTechNewsJsonRead))
    .toBe(true);

  await expectTechNewsStatus(page, "error", locales[1].error);
  expect(getInterceptedRequestCount()).toBe(0);
});

const verificationViewports = [
  { name: "desktop", width: 1440, height: 900, columns: 3 },
  { name: "mobile", width: 390, height: 844, columns: 1 },
];
const verificationMotions = [
  { name: "normal motion", value: "no-preference" },
  { name: "reduced motion", value: "reduce" },
];

for (const locale of locales) {
  for (const viewport of verificationViewports) {
    for (const motion of verificationMotions) {
      test(`${locale.name} ${viewport.name} ${motion.name} keeps every state structurally valid`, async ({
        page,
      }) => {
        await page.clock.install();
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.emulateMedia({ reducedMotion: motion.value });
        const getInterceptedRequestCount = await stubHomeDependencies(page);
        await installControllableTechNewsFetch(page);

        const response = await page.goto(locale.path, { waitUntil: "load" });
        expect(response?.status()).toBe(200);
        await expect
          .poll(() => page.evaluate(() => window.__techNewsFetchCount))
          .toBe(1);
        await expectTechNewsStatus(page, "loading", locale.loading);

        let layout = await getTechNewsLayout(page);
        expect(layout).toMatchObject({
          pageOverflows: false,
          gridOverflows: false,
          columns: viewport.columns,
          childCount: 1,
          cardCount: 0,
          statusCount: 1,
        });

        await resolveTechNewsRequest(page, {
          index: 0,
          body: {
            ok: true,
            techNews: [techNewsItem({ title: "Matrix populated" })],
          },
        });
        await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(1);

        layout = await getTechNewsLayout(page);
        expect(layout).toMatchObject({
          pageOverflows: false,
          gridOverflows: false,
          columns: viewport.columns,
          childCount: 1,
          cardCount: 1,
          statusCount: 0,
        });
        expect(layout.material?.borderRadius).not.toBe("0px");
        expect(layout.material?.beforeContent).not.toBe("none");
        expect(layout.material?.backdropFilter).toMatch(/blur\(/);
        expect(
          hasOnlyZeroDurations(layout.material?.transitionDuration || ""),
        ).toBe(motion.value === "reduce");

        await page.evaluate(() => {
          void loadTechNews();
        });
        await expect
          .poll(() => page.evaluate(() => window.__techNewsFetchCount))
          .toBe(2);
        await resolveTechNewsRequest(page, {
          index: 1,
          body: { ok: true, techNews: [] },
        });
        await expectTechNewsStatus(page, "empty", locale.empty);

        layout = await getTechNewsLayout(page);
        expect(layout).toMatchObject({
          pageOverflows: false,
          gridOverflows: false,
          columns: viewport.columns,
          childCount: 1,
          cardCount: 0,
          statusCount: 1,
        });

        await page.evaluate(() => {
          void loadTechNews();
        });
        await expect
          .poll(() => page.evaluate(() => window.__techNewsFetchCount))
          .toBe(3);
        await resolveTechNewsRequest(page, {
          index: 2,
          status: 500,
          body: { ok: false },
        });
        await expectTechNewsStatus(page, "error", locale.error);

        await page.evaluate(() => {
          void loadTechNews();
        });
        await expect
          .poll(() => page.evaluate(() => window.__techNewsFetchCount))
          .toBe(4);
        const timeoutMs = await page.evaluate(() => TECH_NEWS_REQUEST_TIMEOUT_MS);
        await page.clock.fastForward(timeoutMs);
        await expectTechNewsStatus(page, "timeout", locale.timeout);

        layout = await getTechNewsLayout(page);
        expect(layout).toMatchObject({
          pageOverflows: false,
          gridOverflows: false,
          columns: viewport.columns,
          childCount: 1,
          cardCount: 0,
          statusCount: 1,
        });
        expect(getInterceptedRequestCount()).toBe(0);
      });
    }
  }
}
