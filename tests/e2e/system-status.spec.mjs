import { expect, test } from "@playwright/test";
import { systemStatusFixture, systemStatusHistoryFixture } from "../support/system-status.mjs";

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

async function stubHomeApis(page, handleSystemStatus, handleHistory) {
  await page.route(`${apiOrigin}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === "/api/system-status/history") {
      if (handleHistory) await handleHistory(route);
      else await route.fulfill({ json: systemStatusHistoryFixture() });
      return;
    }

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

const historyStates = ["operational", "degraded_performance", "partial_outage", "major_outage", "unknown"];
const mixedHistory = () => systemStatusHistoryFixture(historyStates.map((status, index) => ({
  date: `2026-08-${20 + index * 2}`, status,
  downtimeSeconds: status === "major_outage" ? 7278 : 0,
  maintenanceSeconds: status === "degraded_performance" ? 125 : 0,
})));

test("mixed incomplete history renders only returned dates, all states, impact durations and separate timestamps", async ({ page }) => {
  const fixture = mixedHistory();
  fixture.components[0].availabilityPercent = 99.98765432;
  fixture.components[2].history[0].maintenanceSeconds = 30;
  await stubHomeApis(page, null, (route) => route.fulfill({ json: fixture }));
  await page.goto("/en/status/");
  const history = page.locator("#systemStatusHistory");
  await expect(history).toHaveAttribute("data-history-state", "ready");
  await expect(history.getByRole("heading", { level: 2 })).toHaveText("Availability & History");
  await expect(history.locator(".system-status-history-card h3")).toHaveText(["Website", "API", "Contact Service"]);
  const website = history.locator('[data-component="website"]');
  await expect(website.locator(".system-status-history-summary")).toHaveText("99.988% availability · 5 days observed");
  const cells = website.locator(".system-status-history-cell");
  await expect(cells).toHaveCount(5);
  expect(await cells.evaluateAll((items) => items.map((item) => [item.dataset.date, item.dataset.status]))).toEqual(
    fixture.components[0].history.map((item) => [item.date, item.status]),
  );
  await expect(cells.locator(".status-symbol")).toHaveText(["●", "▲", "◐", "✕", "?"]);
  await expect(cells.nth(3)).toContainText("Aug 26, 2026 · Major Outage · Downtime: 2 hr 1 min 18 sec");
  const impact = website.locator(".system-status-history-impacts");
  await expect(impact.locator("li")).toHaveCount(4);
  await expect(impact).toContainText("Unknown");
  await expect(impact).toContainText("Maintenance: 2 min 5 sec");
  await expect(impact).toContainText("Downtime: 2 hr 1 min 18 sec");
  await expect(history.locator('[data-component="contact"] .system-status-history-impacts li')).toHaveCount(5);
  await expect(history.locator('[data-component="contact"] .system-status-history-impacts li').last()).toContainText("OperationalMaintenance: 30 sec");
  expect(await impact.locator("time").evaluateAll((items) => items.map((item) => item.dateTime))).toEqual(["2026-08-28", "2026-08-26", "2026-08-24", "2026-08-22"]);
  await expect(history.locator(".system-status-history-fetched")).toContainText("History fetched:");
  await expect(page.locator(".system-status-checked-at")).toContainText("Last checked:");
  await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
  await expect(history.locator(".system-status-history-notice")).toHaveCount(1);
  await expect(history.locator(".system-status-history-content [role=status], .system-status-history-content [aria-live]")).toHaveCount(0);
  await expect(history.locator(".system-status-history-content")).not.toHaveAttribute("aria-live", /.+/);
});

for (const [name, mutate] of [
  ["contradictory false/true", (data) => { data.ok = false; }],
  ["contradictory true/false", (data) => { data.complete = false; }],
  ["true/true with unknown current status", (data) => { data.components[1].status = "unknown"; }],
  ["true/true with unknown history status", (data) => { data.components[2].history[0].status = "unknown"; }],
  ["true/true with null availability", (data) => { data.components[0].availabilityPercent = null; }],
  ["false/false with complete content", (data) => { data.ok = false; data.complete = false; }],
]) {
  test(`history rejects ${name} without changing Phase A`, async ({ page }) => {
    const fixture = systemStatusHistoryFixture();
    await stubHomeApis(page, null, (route) => route.fulfill({ json: fixture }));
    await page.goto("/en/status/");
    const history = page.locator("#systemStatusHistory");
    await expect(history).toHaveAttribute("data-history-state", "ready");
    await expect(history.locator(".system-status-history-notice")).toHaveCount(0);
    await expect(history.locator(".system-status-history-cell")).toHaveCount(3);
    mutate(fixture);
    await page.evaluate(() => loadSystemStatusHistory());
    await expect(history).toHaveAttribute("data-history-state", "error");
    await expect(history.getByRole("status")).toHaveText("Unable to load history. History status is unknown.");
    await expect(history.locator(".system-status-history-card")).toHaveCount(0);
    await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
  });
}

for (const [locale, loading, loaded, unavailable] of [
  ["/status/", "正在載入監測歷史……", "歷史紀錄已載入。", "無法載入歷史紀錄，歷史狀態不明。"],
  ["/en/status/", "Loading monitoring history…", "Monitoring history loaded.", "Unable to load history. History status is unknown."],
  ["/ja/status/", "監視履歴を読み込み中…", "監視履歴を読み込みました。", "履歴を読み込めません。履歴の状態は不明です。"],
]) {
  test(`${locale} history live region announces loading, completion and error without announcing 90-day content`, async ({ page }) => {
    const pending = [];
    await stubHomeApis(page, null, (route) => { pending.push(route); });
    await page.goto(locale);
    const history = page.locator("#systemStatusHistory");
    const message = history.getByRole("status");
    await expect.poll(() => pending.length).toBe(1);
    await expect(history).toHaveAttribute("data-history-state", "loading");
    await expect(message).toHaveText(loading);
    await expect(message).toBeVisible();
    await expect(message).toHaveCSS("clip-path", "none");
    await expect(message).toHaveAttribute("aria-live", "polite");
    await expect(message).toHaveAttribute("aria-atomic", "true");
    const fixture = systemStatusHistoryFixture(Array.from({ length: 90 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 5, index + 1)).toISOString().slice(0, 10),
      status: "operational", downtimeSeconds: 0, maintenanceSeconds: 0,
    })));
    await pending.shift().fulfill({ json: fixture });
    await expect(history).toHaveAttribute("data-history-state", "ready");
    await expect(message).toHaveCount(1);
    await expect(message).toHaveText(loaded);
    await expect(message).toMatchAriaSnapshot(`- status: ${loaded}`);
    await expect(message).toHaveCSS("display", "block");
    await expect(message).toHaveCSS("visibility", "visible");
    await expect(message).toHaveCSS("clip-path", "inset(50%)");
    expect(await message.evaluate((element) => element.closest('[hidden], [aria-hidden="true"]') === null)).toBe(true);
    await expect(history.locator(".system-status-history-cell")).toHaveCount(270);
    const content = history.locator(".system-status-history-content");
    expect(await content.evaluate((element) => element.closest('[aria-live], [role="status"], [role="alert"], [role="log"]') === null)).toBe(true);
    await expect(content.locator('[aria-live], [role="status"], [role="alert"], [role="log"]')).toHaveCount(0);
    await expect(history.locator(".system-status-history-notice")).toHaveCount(0);

    await page.evaluate(() => { void loadSystemStatusHistory(); });
    await expect.poll(() => pending.length).toBe(1);
    await expect(message).toHaveText(loading);
    await expect(message).toBeVisible();
    await expect(message).toHaveCSS("clip-path", "none");
    await pending.shift().fulfill({ status: 503, json: {} });
    await expect(history).toHaveAttribute("data-history-state", "error");
    await expect(message).toHaveText(unavailable);
    await expect(message).toBeVisible();
    await expect(message).toHaveCSS("clip-path", "none");
    await expect(content).toBeEmpty();
    await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
  });
}

for (const [locale, title, incomplete, observed, unknown, empty, error] of [
  ["/status/", "可用率與歷史紀錄", "外部監測資料尚不完整", "已觀測 1 天", "可用率不明", "已觀測的歷史紀錄中，沒有服務受影響的日期。", "無法載入歷史紀錄"],
  ["/en/status/", "Availability & History", "External monitoring data is incomplete", "1 day observed", "Availability unknown", "No service-impact days in the observed history.", "Unable to load history"],
  ["/ja/status/", "可用性と履歴", "外部監視データは一部不足しています", "観測日数：1 日", "可用率は不明", "観測履歴にサービスへの影響があった日はありません。", "履歴を読み込めません"],
]) {
  test(`${locale} incomplete one-day history, unknown availability, empty impact and localized errors`, async ({ page }) => {
    const fixture = systemStatusHistoryFixture();
    fixture.ok = false;
    fixture.complete = false;
    fixture.components[1].availabilityPercent = null;
    fixture.components[1].status = "unknown";
    fixture.components[1].history[0].status = "major_outage";
    fixture.components[1].history[0].downtimeSeconds = 7278;
    let malformed = false;
    await stubHomeApis(page, null, (route) => route.fulfill({ json: malformed ? {} : fixture }));
    await page.goto(locale);
    const history = page.locator("#systemStatusHistory");
    await expect(history).toHaveAttribute("data-history-state", "ready");
    await expect(history.getByRole("heading", { level: 2 })).toHaveText(title);
    await expect(history.locator(".system-status-history-notice")).toContainText(incomplete);
    await expect(history.locator(".system-status-history-cell")).toHaveCount(3);
    for (const id of ["website", "api", "contact"]) {
      const card = history.locator(`[data-component="${id}"]`);
      await expect(card.locator(".system-status-history-cell")).toHaveCount(1);
      await expect(card.locator(".system-status-history-summary")).toContainText(observed);
    }
    await expect(history.locator('[data-component="website"]')).toContainText(empty);
    await expect(history.locator('[data-component="website"] .system-status-history-summary')).toContainText("100%");
    await expect(history.locator('[data-component="api"] .system-status-history-summary')).toContainText(unknown);
    await expect(history.locator('[data-component="api"] .system-status-history-summary')).not.toContainText("0%");
    await expect(history.locator('[data-component="api"] .system-status-history-impacts li')).toHaveCount(1);
    await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
    malformed = true;
    await page.evaluate(() => loadSystemStatusHistory());
    await expect(history).toHaveAttribute("data-history-state", "error");
    await expect(history.locator(".system-status-history-message")).toContainText(error);
    await expect(history.locator(".system-status-history-card")).toHaveCount(0);
    await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
  });
}

test("zero observed days render neither fake cells nor a date range", async ({ page }) => {
  await stubHomeApis(page, null, (route) => route.fulfill({ json: systemStatusHistoryFixture([]) }));
  await page.goto("/en/status/");
  await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "ready");
  await expect(page.locator(".system-status-history-summary")).toHaveText(Array(3).fill("Availability unknown · 0 days observed"));
  await expect(page.locator(".system-status-history-cell, .system-status-history-range")).toHaveCount(0);
  await expect(page.getByText("No observed history available.", { exact: true })).toHaveCount(3);
});

test("both request failures are independent, including HTTP, network and malformed history", async ({ page }) => {
  let currentFails = true;
  let historyFailure = "none";
  await stubHomeApis(page,
    (route) => route.fulfill({ status: currentFails ? 503 : 200, json: systemStatusFixture() }),
    (route) => historyFailure === "network" ? route.abort("failed") : route.fulfill({
      status: historyFailure === "http" ? 503 : 200,
      json: historyFailure === "malformed" ? { ...systemStatusHistoryFixture(), components: [] } : mixedHistory(),
    }));
  await page.goto("/en/status/");
  await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "unknown");
  await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "ready");
  currentFails = false;
  await page.evaluate(() => loadSystemStatus());
  for (const failure of ["http", "network", "malformed"]) {
    historyFailure = failure;
    await page.evaluate(() => loadSystemStatusHistory());
    await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "error");
    await expect(page.locator(".system-status-history-cell")).toHaveCount(0);
    await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
  }
});

test("history timeout aborts independently and ignores a late successful response", async ({ page }) => {
  await stubHomeApis(page);
  await page.goto("/en/status/");
  await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "ready");
  await page.clock.install();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (url, options) => url.endsWith("/api/system-status/history")
      ? new Promise((resolve) => { window.historyTestPending = { resolve, signal: options.signal }; })
      : original(url, options);
    window.historyTestTask = loadSystemStatusHistory();
  });
  await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "loading");
  await page.clock.fastForward(6001);
  await expect(page.locator(".system-status-history-message")).toHaveText("Unable to load history. History status is unknown.");
  expect(await page.evaluate(() => window.historyTestPending.signal.aborted)).toBe(true);
  await page.evaluate(async (fixture) => {
    window.historyTestPending.resolve({ ok: true, json: async () => fixture });
    await window.historyTestTask;
  }, mixedHistory());
  await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "error");
  await expect(page.locator(".system-status-history-cell")).toHaveCount(0);
  await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
});

test("superseded history requests abort and cannot overwrite newer history", async ({ page }) => {
  await stubHomeApis(page);
  await page.goto("/en/status/");
  await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "ready");
  await page.evaluate(() => {
    window.historyTestPending = [];
    window.fetch = (_url, options) => new Promise((resolve) => window.historyTestPending.push({ resolve, signal: options.signal }));
    window.historyTestOld = loadSystemStatusHistory();
    window.historyTestNew = loadSystemStatusHistory();
  });
  expect(await page.evaluate(() => window.historyTestPending[0].signal.aborted)).toBe(true);
  await page.evaluate(async (fixture) => {
    window.historyTestPending[1].resolve({ ok: true, json: async () => fixture });
    await window.historyTestNew;
  }, mixedHistory());
  await expect(page.locator(".system-status-history-cell")).toHaveCount(15);
  await page.evaluate(async (fixture) => {
    window.historyTestPending[0].resolve({ ok: true, json: async () => fixture });
    await window.historyTestOld;
  }, systemStatusHistoryFixture());
  await expect(page.locator(".system-status-history-cell")).toHaveCount(15);
  await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
});

test("history uses the same API base as current status and Home issues no history request", async ({ page }) => {
  const historyRequests = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/system-status/history")) historyRequests.push(request.url());
  });
  await stubHomeApis(page);
  await page.goto("/en/");
  await expect(page.locator(".system-status-live")).toHaveAttribute("data-status", "operational");
  await page.evaluate(() => loadSystemStatusHistory());
  expect(historyRequests).toEqual([]);
  await expect(page.locator("#systemStatusHistory")).toHaveCount(0);
  await page.goto("/en/status/");
  await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "ready");
  expect(historyRequests).toEqual([await page.evaluate(() => `${getHuihuiApiBase()}/api/system-status/history`)]);
});

test("90-day strips wrap at desktop/mobile sizes and forced colors retain symbols and boundaries", async ({ page }) => {
  const fixture = systemStatusHistoryFixture(Array.from({ length: 90 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 5, index + 1)).toISOString().slice(0, 10),
    status: historyStates[index % historyStates.length], downtimeSeconds: 0, maintenanceSeconds: 0,
  })));
  await stubHomeApis(page, null, (route) => route.fulfill({ json: fixture }));
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/ja/status/");
    await expect(page.locator(".system-status-history-cell")).toHaveCount(270);
    await expectNoHorizontalOverflow(page);
    const cardGeometry = await page.locator(".system-status-history-card").evaluateAll((cards) => cards.map((card) => ({
      x: card.getBoundingClientRect().x, width: card.getBoundingClientRect().width,
    })));
    expect(new Set(cardGeometry.map((card) => card.x)).size).toBe(1);
    expect(new Set(cardGeometry.map((card) => card.width)).size).toBe(1);
  }
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const systemColors = await page.evaluate(() => {
    const sample = document.createElement("span");
    sample.style.color = "CanvasText";
    sample.style.backgroundColor = "Canvas";
    document.body.append(sample);
    const colors = { color: getComputedStyle(sample).color, background: getComputedStyle(sample).backgroundColor };
    sample.remove();
    return colors;
  });
  const cells = page.locator('[data-component="website"] .system-status-history-cell');
  for (let index = 0; index < 5; index += 1) {
    await expect(cells.nth(index).locator(".status-symbol")).toBeVisible();
    const styles = await cells.nth(index).evaluate((cell) => {
      const style = getComputedStyle(cell);
      return { border: style.borderTopWidth, borderStyle: style.borderTopStyle, color: style.color, background: style.backgroundColor, animation: style.animationName };
    });
    expect(styles.border).toBe("1px");
    expect(styles.borderStyle).toBe("solid");
    expect(styles.color).not.toBe(styles.background);
    expect(styles.color).toBe(systemColors.color);
    expect(styles.background).toBe(systemColors.background);
    expect(styles.animation).toBe("none");
  }
  expect(await cells.locator(".status-symbol").allTextContents()).toEqual(Array.from({ length: 90 }, (_, i) => ["●", "▲", "◐", "✕", "?"][i % 5]));
  await expect(page.locator(".system-status-history-legend .status-chip")).toHaveCount(5);
  expect(await page.locator("#systemStatusHistory .status-chip").evaluateAll((chips) =>
    chips.every((chip) => getComputedStyle(chip).color === getComputedStyle(chips[0]).color),
  )).toBe(true);
  expect(await page.locator(".system-status-history-legend .status-chip").first().evaluate((chip) => getComputedStyle(chip).color)).toBe(systemColors.color);
  await expectNoHorizontalOverflow(page);
});

test("calendar bucket dates do not shift in a negative UTC offset", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "America/Los_Angeles" });
  try {
    const page = await context.newPage();
    await stubHomeApis(page);
    await page.goto("http://127.0.0.1:4173/en/status/");
    await expect(page.locator(".system-status-history-range").first()).toHaveText("Observed date range: Aug 30, 2026 – Aug 30, 2026");
    await expect(page.locator(".system-status-history-cell").first()).toContainText("Aug 30, 2026");
  } finally {
    await context.close();
  }
});

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
