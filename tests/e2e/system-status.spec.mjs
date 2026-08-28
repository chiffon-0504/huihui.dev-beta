import { expect, test } from "@playwright/test";
import { systemStatusFixture } from "../support/system-status.mjs";

const apiOrigin = "https://api.huihui.dev";
const localeCases = [
  {
    home: "/",
    status: "/status/",
    title: "huihui.dev 系統狀態",
    allOperational: "全部系統運作正常",
    components: ["Website", "API", "聯絡服務"],
  },
  {
    home: "/en/",
    status: "/en/status/",
    title: "huihui.dev System Status",
    allOperational: "All Systems Operational",
    components: ["Website", "API", "Contact Service"],
  },
  {
    home: "/ja/",
    status: "/ja/status/",
    title: "huihui.dev システム状況",
    allOperational: "すべてのシステムが正常稼働中",
    components: ["Website", "API", "Contact Service"],
  },
];

async function stubHomeApis(page, handleSystemStatus) {
  await page.route(`${apiOrigin}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === "/api/system-status") {
      if (handleSystemStatus) {
        await handleSystemStatus(route);
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(systemStatusFixture()),
        });
      }
      return;
    }

    const body = pathname === "/api/tech-news"
      ? { ok: true, techNews: [] }
      : pathname === "/api/infrastructure-status"
        ? { ok: true, providers: [] }
        : null;

    await route.fulfill({
      status: body ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(body || { ok: false }),
    });
  });
}

async function expectNoHorizontalOverflow(page) {
  const geometry = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));

  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
}

for (const locale of localeCases) {
  test(`${locale.home} renders localized operational Home and status routes`, async ({
    page,
  }) => {
    await stubHomeApis(page);
    await page.goto(locale.home, { waitUntil: "load" });

    const homeStatus = page.locator('[data-system-status-surface="home"]');
    await expect(homeStatus).toHaveAttribute("data-status", "operational");
    const overall = homeStatus.locator(".system-status-overall");
    await expect(overall).toContainText(
      locale.allOperational,
    );
    await expect(overall.locator(".status-chip")).toHaveCount(0);
    await expect(homeStatus.locator(".system-status-component-row")).toHaveCount(3);
    await expect(
      homeStatus.locator(".system-status-state.status-chip"),
    ).toHaveCount(3);
    const viewStatus = homeStatus.locator(".system-status-link.status-link");
    await expect(viewStatus).toHaveAttribute("href", locale.status);
    await viewStatus.focus();
    await expect(viewStatus).toBeFocused();

    await page.goto(locale.status, { waitUntil: "load" });
    const detail = page.locator('[data-system-status-surface="detail"]');
    await expect(page.getByRole("heading", { name: locale.title })).toBeVisible();
    await expect(detail).toHaveAttribute("data-status", "operational");
    await expect(detail.locator(".system-status-component-card")).toHaveCount(3);
    await expect(
      detail.locator(".system-status-state.status-chip"),
    ).toHaveCount(3);
    await expect(
      detail.locator(".system-status-overall .status-chip"),
    ).toHaveCount(0);
    await expect(detail.locator(".system-status-component-card h2")).toHaveText(
      locale.components,
    );
    await expect(detail.locator(".system-status-checked-at")).not.toContainText(
      "NaN",
    );
    await expectNoHorizontalOverflow(page);
  });
}

test("renders every first-party state from deterministic fixtures", async ({ page }) => {
  let currentStatus = "operational";
  await stubHomeApis(page, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(systemStatusFixture(currentStatus)),
    }),
  );
  await page.goto("/en/", { waitUntil: "load" });

  const expectedLabels = {
    operational: "All Systems Operational",
    degraded_performance: "Degraded Performance",
    partial_outage: "Partial Outage",
    major_outage: "Major Outage",
    unknown: "System Status Unknown",
  };

  for (const status of Object.keys(expectedLabels)) {
    currentStatus = status;
    await page.evaluate(() => loadSystemStatus());
    const card = page.locator('[data-system-status-surface="home"]');

    await expect(card).toHaveAttribute("data-status", status);
    await expect(card.locator(".system-status-overall")).toContainText(
      expectedLabels[status],
    );
    const componentChips = card.locator(".system-status-state.status-chip");
    await expect(componentChips).toHaveText(
      Array(3).fill(status === "unknown" ? "?Unknown" : `${status === "major_outage" ? "✕" : status === "partial_outage" ? "◐" : status === "degraded_performance" ? "▲" : "●"}${status === "operational" ? "Operational" : expectedLabels[status]}`),
    );
    expect(
      await componentChips.evaluateAll(
        (chips, expectedStatus) =>
          chips.every(
            (chip) =>
              chip.dataset.status === expectedStatus &&
              chip.textContent.trim() &&
              chip
                .querySelector(".status-symbol")
                ?.getAttribute("aria-hidden") === "true",
          ),
        status,
      ),
    ).toBe(true);
    await expect(
      card.locator(".system-status-overall .status-chip"),
    ).toHaveCount(0);
  }
});

test("fetch failure and malformed duplicate data clear stale green to Unknown", async ({
  page,
}) => {
  let requestCount = 0;
  await stubHomeApis(page, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(systemStatusFixture()),
      });
      return;
    }

    if (requestCount === 2) {
      const malformed = systemStatusFixture();
      malformed.components[2] = { id: "api", status: "operational" };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(malformed),
      });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false }),
    });
  });
  await page.goto("/en/", { waitUntil: "load" });
  const card = page.locator('[data-system-status-surface="home"]');

  await expect(card).toHaveAttribute("data-status", "operational");
  await page.evaluate(() => loadSystemStatus());
  await expect(card).toHaveAttribute("data-status", "unknown");
  await expect(card.locator(".system-status-state")).toHaveText([
    "?Unknown",
    "?Unknown",
    "?Unknown",
  ]);
  await page.evaluate(() => loadSystemStatus());
  await expect(card).toHaveAttribute("data-status", "unknown");
  await expect(card).not.toContainText("All Systems Operational");
});

test("provider incidents remain independent from huihui.dev System Status", async ({
  page,
}) => {
  await page.route(`${apiOrigin}/**`, (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === "/api/system-status"
      ? systemStatusFixture()
      : pathname === "/api/tech-news"
        ? { ok: true, techNews: [] }
        : pathname === "/api/infrastructure-status"
          ? {
              ok: true,
              providers: [
                {
                  id: "cloudflare",
                  status: "major_outage",
                  components: [
                    { id: "pages", status: "major_outage" },
                    { id: "workers", status: "major_outage" },
                    { id: "dns", status: "major_outage" },
                    { id: "cdn", status: "major_outage" },
                  ],
                },
                {
                  id: "github",
                  status: "major_outage",
                  components: [
                    { id: "actions", status: "major_outage" },
                    { id: "api_requests", status: "major_outage" },
                    { id: "git_operations", status: "major_outage" },
                  ],
                },
              ],
            }
          : null;

    return route.fulfill({
      status: body ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(body || { ok: false }),
    });
  });
  await page.goto("/en/", { waitUntil: "load" });

  await expect(page.locator('[data-system-status-surface="home"]')).toHaveAttribute(
    "data-status",
    "operational",
  );
  expect(
    await page.locator(".infrastructure-status-card").evaluateAll((cards) =>
      cards.map((card) => card.dataset.status),
    ),
  ).toEqual(["major_outage", "major_outage"]);
});

test("desktop, mobile, forced colors, and reduced motion remain understandable", async ({
  page,
}) => {
  await stubHomeApis(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/ja/", { waitUntil: "load" });
    await expect(page.locator(".system-status-component-row")).toHaveCount(3);
    await expectNoHorizontalOverflow(page);
  }

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/en/status/", { waitUntil: "load" });
  const detail = page.locator(".system-status-detail");
  await expect(detail).toHaveAttribute("data-status", "operational");
  expect(
    await detail.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  const componentChips = detail.locator(".system-status-state.status-chip");
  await expect(componentChips).toHaveText([
    "●Operational",
    "●Operational",
    "●Operational",
  ]);
  const forcedColors = await componentChips.first().evaluate((chip) => {
    const canvas = document.createElement("span");
    canvas.style.backgroundColor = "Canvas";
    canvas.style.color = "CanvasText";
    document.body.append(canvas);
    const result = {
      background: getComputedStyle(chip).backgroundColor,
      canvas: getComputedStyle(canvas).backgroundColor,
      color: getComputedStyle(chip).color,
      canvasText: getComputedStyle(canvas).color,
    };
    canvas.remove();
    return result;
  });
  expect(forcedColors.background).toBe(forcedColors.canvas);
  expect(forcedColors.color).toBe(forcedColors.canvasText);
});
