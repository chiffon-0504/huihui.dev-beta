import { expect, test } from "@playwright/test";
import { systemStatusFixture, systemStatusHistoryFixture, systemStatusIncidentsFixture, systemStatusIncidentReport } from "../support/system-status.mjs";

const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const locales = [
  { route: "/status/", home: "/", locale: "zh-Hant", title: "事故與狀態更新", loading: "正在載入事故紀錄……", loaded: "事故紀錄已載入。", empty: "目前沒有事故或狀態更新。", unavailable: "目前無法取得事故紀錄。", fetched: "最後擷取", link: "查看狀態報告" },
  { route: "/en/status/", home: "/en/", locale: "en", title: "Incidents & Status Updates", loading: "Loading incident history…", loaded: "Incident history loaded.", empty: "No incidents or status updates are currently available.", unavailable: "Incident history is currently unavailable.", fetched: "Last fetched", link: "View status report" },
  { route: "/ja/status/", home: "/ja/", locale: "ja", title: "インシデントとステータス更新", loading: "インシデント履歴を読み込み中…", loaded: "インシデント履歴を読み込みました。", empty: "現在、インシデントまたはステータス更新はありません。", unavailable: "現在、インシデント履歴を取得できません。", fetched: "最終取得", link: "ステータスレポートを見る" },
];

async function stub(page, { incidents, current = systemStatusFixture(), history = systemStatusHistoryFixture([
  { date: "2026-08-30", status: "major_outage", downtimeSeconds: 7278, maintenanceSeconds: 0 },
]) } = {}) {
  const diagnostics = { unexpected: [], console: [], errors: [], requests: [] };
  page.on("console", (message) => { if (message.type() === "error") diagnostics.console.push(message.text()); });
  page.on("pageerror", (error) => diagnostics.errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:4173") return route.continue();
    if (["https://api.huihui.dev", "https://huihui-api-beta.huihuigames01.workers.dev"].includes(url.origin)) {
      diagnostics.requests.push(url.pathname);
      if (url.pathname === "/api/system-status/incidents") {
        if (incidents) return incidents(route);
        return route.fulfill({ json: systemStatusIncidentsFixture() });
      }
      const payload = {
        "/api/system-status": current, "/api/system-status/history": history,
        "/api/tech-news": { ok: true, techNews: [] }, "/api/infrastructure-status": { ok: true, providers: [] },
      }[url.pathname];
      if (payload) return route.fulfill({ json: payload });
    }
    diagnostics.unexpected.push(route.request().url());
    return route.abort();
  });
  return diagnostics;
}

function expectClean(diagnostics) {
  expect(diagnostics.unexpected).toEqual([]);
  expect(diagnostics.console).toEqual([]);
  expect(diagnostics.errors).toEqual([]);
}

async function noOverflow(page) {
  expect(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function expectIndependent(page) {
  await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
  await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "ready");
  await expect(page.locator(".system-status-history-cell[data-status='major_outage']")).toHaveCount(3);
}

test.describe("B3 localized UI", () => {
  test.use({ timezoneId: "America/Los_Angeles" });
  for (const copy of locales) {
    test(`${copy.route} loading, visible empty success and unavailable remain distinct`, async ({ page }, testInfo) => {
      let release;
      let fixture = systemStatusIncidentsFixture();
      const diagnostics = await stub(page, { incidents: async (route) => {
        await new Promise((resolve) => { release = resolve; });
        await route.fulfill({ json: fixture });
      } });
      for (const viewport of viewports) {
        fixture = systemStatusIncidentsFixture();
        release = undefined;
        await page.setViewportSize(viewport);
        await page.goto(copy.route);
        const section = page.locator("#systemStatusIncidents");
        const message = section.locator(".system-status-incidents-message");
        await expect(section).toHaveAttribute("data-incidents-state", "loading");
        await expect(section.locator("h2")).toHaveText(copy.title);
        await expect(section.locator(".system-status-incidents-intro")).toContainText("Better Stack");
        await expect(message).toHaveText(copy.loading);
        await expect(message).toBeVisible();
        await expectIndependent(page);
        await expect.poll(() => typeof release).toBe("function");
        release();
        await expect(section).toHaveAttribute("data-incidents-state", "ready");
        await expect(message).toHaveText(copy.empty);
        await expect(message).toBeVisible();
        await expect(message).toHaveCSS("clip-path", "none");
        await expect(section.locator("article")).toHaveCount(0);
        await expect(section.locator(".system-status-incidents-fetched")).toContainText(copy.fetched);
        await expect(section.locator("time")).toHaveAttribute("datetime", fixture.fetchedAt);
        await expectIndependent(page);
        expect(await section.evaluate((node) => node.previousElementSibling.id)).toBe("systemStatusHistory");
        await noOverflow(page);
        await section.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`empty-${viewport.width}.png`) });

        fixture = { ...systemStatusIncidentsFixture(), ok: false };
        const failed = page.evaluate(() => loadSystemStatusIncidents());
        await expect(message).toHaveText(copy.loading);
        // The request handler, not a sleep, controls the lifecycle transition.
        await expect.poll(() => diagnostics.requests.filter((path) => path.endsWith("/incidents")).length).toBe(viewport.width === 1440 ? 2 : 4);
        release();
        await failed;
        await expect(section).toHaveAttribute("data-incidents-state", "error");
        await expect(message).toHaveText(copy.unavailable);
        await expect(message).toBeVisible();
        await expect(section).not.toContainText(copy.empty);
        await expect(section.locator("time")).toHaveCount(0);
        await expectIndependent(page);
        await noOverflow(page);
        await page.screenshot({ path: testInfo.outputPath(`unavailable-${viewport.width}.png`) });
      }
      expectClean(diagnostics);
    });

    test(`${copy.route} populated chronology, local instants, literal messages, focus and forced colors`, async ({ page }, testInfo) => {
      const reports = [systemStatusIncidentReport(0, 3), systemStatusIncidentReport(1, 2)];
      reports[0].title = "API <b>status update</b> " + "長い標題".repeat(40);
      reports[0].updates[0].message = '<script>window.incidentExecuted = true</script>\n<img src=x onerror="window.incidentExecuted=true">\n' + "LongUnbrokenMessage".repeat(160);
      const fixture = systemStatusIncidentsFixture(reports);
      const diagnostics = await stub(page, { incidents: (route) => route.fulfill({ json: fixture }) });
      for (const viewport of viewports) {
        await page.emulateMedia({ forcedColors: "none" });
        await page.setViewportSize(viewport);
        await page.goto(copy.route);
        const section = page.locator("#systemStatusIncidents");
        await expect(section).toHaveAttribute("data-incidents-state", "ready");
        await expect(section.locator("article h3")).toHaveText(reports.map((report) => report.title));
        await expect(section.locator("script, img, b")).toHaveCount(0);
        expect(await page.evaluate(() => window.incidentExecuted)).toBeUndefined();
        await expect(section.locator(".system-status-incident-message").first()).toHaveText(reports[0].updates[0].message);
        await expect(section.locator(".system-status-incident-message").first()).toHaveCSS("white-space", "pre-wrap");
        for (const [index, report] of reports.entries()) {
          const article = section.locator("article").nth(index);
          const times = article.locator("ol > li > time");
          expect(await times.evaluateAll((nodes) => nodes.map((node) => node.dateTime))).toEqual(report.updates.map((u) => u.publishedAt));
          const expected = report.updates.map((update) => new Intl.DateTimeFormat(copy.locale, {
            year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
            timeZoneName: "short", timeZone: "America/Los_Angeles",
          }).format(new Date(update.publishedAt)));
          await expect(times).toHaveText(expected);
          await expect(article.getByRole("link", { name: `${copy.link}: ${report.title}`, exact: true })).toHaveAttribute("href", report.url);
          await expect(article.locator("a")).toHaveAttribute("rel", "noopener noreferrer");
          await expect(article.locator("a")).toHaveAttribute("target", "_blank");
          await expect(section).not.toContainText(report.key);
        }
        const message = section.locator(".system-status-incidents-message");
        await expect(message).toHaveText(copy.loaded);
        await expect(message).toHaveAttribute("role", "status");
        await expect(message).toHaveAttribute("aria-live", "polite");
        await expect(message).toHaveAttribute("aria-atomic", "true");
        expect(await section.locator("article").evaluateAll((nodes) => nodes.every((node) => !node.closest('[aria-live], [role="status"]')))).toBe(true);
        await expectIndependent(page);
        await noOverflow(page);
        const firstLink = section.locator("a").first();
        await firstLink.focus();
        await page.keyboard.press("ArrowRight");
        await expect(firstLink).toBeFocused();
        expect(await firstLink.evaluate((node) => node.tabIndex)).toBe(0);
        expect(await firstLink.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
        expect(await firstLink.evaluate((node) => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThan(0);
        await firstLink.scrollIntoViewIfNeeded();
        await expect(firstLink).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath(`populated-${viewport.width}.png`) });

        await page.emulateMedia({ forcedColors: "active" });
        const styles = await section.locator("article").first().evaluate((node) => {
          const article = getComputedStyle(node);
          const row = getComputedStyle(node.querySelector("li"));
          const time = getComputedStyle(node.querySelector("time"));
          const probe = document.createElement("span");
          probe.style.cssText = "color: CanvasText; background-color: Canvas";
          node.append(probe);
          const canvasText = getComputedStyle(probe).color;
          const canvas = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return { border: article.borderTopWidth, boundary: article.borderTopColor, background: article.backgroundColor,
            line: row.borderInlineStartWidth, time: time.color, text: getComputedStyle(node.querySelector("p")).color, canvasText, canvas };
        });
        expect(styles.border).toBe("1px");
        expect(styles.line).toBe("2px");
        expect(styles.boundary).not.toBe(styles.background);
        expect(styles.time).not.toBe(styles.background);
        expect(styles.text).not.toBe(styles.background);
        expect(styles.background).toBe(styles.canvas);
        expect(styles.boundary).toBe(styles.canvasText);
        expect(styles.time).toBe(styles.canvasText);
        expect(styles.text).toBe(styles.canvasText);
        await expect(firstLink).toBeFocused();
        await expect(firstLink).toHaveCSS("outline-style", "solid");
        await firstLink.scrollIntoViewIfNeeded();
        await expect(firstLink).toBeInViewport();
        await noOverflow(page);
        await page.screenshot({ path: testInfo.outputPath(`forced-colors-${viewport.width}.png`) });
      }
      expectClean(diagnostics);
    });

    test(`${copy.route} link focusability and native Tab navigation`, async ({ page }, testInfo) => {
      const reports = [systemStatusIncidentReport(), systemStatusIncidentReport(1)];
      const diagnostics = await stub(page, { incidents: (route) => route.fulfill({ json: systemStatusIncidentsFixture(reports) }) });
      await page.goto(copy.route);
      const links = page.locator(".system-status-incident-link");
      await expect(links).toHaveCount(2);
      const linkContract = await links.evaluateAll((nodes) => nodes.map((node) => ({
        tagName: node.tagName,
        href: node.getAttribute("href"),
        tabIndex: node.tabIndex,
        target: node.getAttribute("target"),
        rel: node.getAttribute("rel"),
        role: node.getAttribute("role"),
      })));
      expect(linkContract.map(({ href }) => href)).toEqual(reports.map(({ url }) => url));
      expect(linkContract.every(({ tagName, href, tabIndex, target, rel, role }) =>
        tagName === "A" && typeof href === "string" && tabIndex === 0 && target === "_blank" &&
        rel === "noopener noreferrer" && role === null)).toBe(true);
      for (const [index, report] of reports.entries()) {
        const link = links.nth(index);
        await expect(link).toHaveAccessibleName(`${copy.link}: ${report.title}`);
        await link.focus();
        await page.keyboard.press("ArrowRight");
        await expect(link).toBeFocused();
        expect(await link.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
        expect(await link.evaluate((node) => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThan(0);
      }
      if (testInfo.project.name === "chromium") {
        await links.first().focus();
        await page.keyboard.press("Tab");
        await expect(links.nth(1)).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(links.first()).toBeFocused();
      }
      expectClean(diagnostics);
    });

    test(`${copy.route} custom incident origin renders unchanged; mixed origins fail closed`, async ({ page }) => {
      const reports = [systemStatusIncidentReport(), systemStatusIncidentReport(1)];
      reports[0].url = "https://status.huihui.dev/incident/abc";
      reports[1].url = "https://status.huihui.dev/incident/def";
      const fixture = systemStatusIncidentsFixture(reports);
      const diagnostics = await stub(page, { incidents: (route) => route.fulfill({ json: fixture }) });
      await page.goto(copy.route);
      const section = page.locator("#systemStatusIncidents");
      await expect(section).toHaveAttribute("data-incidents-state", "ready");
      await expect(section.locator("article")).toHaveCount(2);
      for (const report of reports) {
        await expect(section.getByRole("link", { name: `${copy.link}: ${report.title}`, exact: true }))
          .toHaveAttribute("href", report.url);
      }
      await expectIndependent(page);
      reports[1].url = "https://huihui-dev.betteruptime.com/incident/def";
      await page.evaluate(() => loadSystemStatusIncidents());
      await expect(section).toHaveAttribute("data-incidents-state", "error");
      await expect(section.locator(".system-status-incidents-message")).toHaveText(copy.unavailable);
      await expect(section.locator("article, a, time")).toHaveCount(0);
      await expectIndependent(page);
      expectClean(diagnostics);
    });

    test(`${copy.route} B2 or Phase A failure does not prevent valid B3`, async ({ page }) => {
      for (const failure of ["current", "history"]) {
        const diagnostics = await stub(page, { [failure]: { ok: false }, incidents: (route) => route.fulfill({ json: systemStatusIncidentsFixture([systemStatusIncidentReport()]) }) });
        await page.goto(copy.route);
        await expect(page.locator("#systemStatusIncidents")).toHaveAttribute("data-incidents-state", "ready");
        await expect(page.locator(".system-status-incident")).toHaveCount(1);
        await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", failure === "current" ? "unknown" : "operational");
        await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", failure === "history" ? "error" : "ready");
        expectClean(diagnostics);
        await page.unroute("**/*");
      }
    });

    test(`${copy.home} Home never requests B3`, async ({ page }) => {
      const diagnostics = await stub(page);
      await page.goto(copy.home);
      await expect(page.locator('[data-system-status-surface="home"]')).toHaveAttribute("data-system-status-state", "ready");
      await expect(page.locator("#systemStatusIncidents")).toHaveCount(0);
      expect(diagnostics.requests.sort()).toEqual(["/api/infrastructure-status", "/api/system-status", "/api/tech-news"]);
      expectClean(diagnostics);
    });
  }
});

test("20 reports × 20 updates stay reachable without clipping or horizontal overflow", async ({ page }) => {
  const reports = Array.from({ length: 20 }, (_, i) => systemStatusIncidentReport(i, 20));
  reports.forEach((report) => {
    report.title = "長".repeat(200);
    report.updates.forEach((update) => { update.message = "長い本文\n".repeat(800); });
  });
  const diagnostics = await stub(page, { incidents: (route) => route.fulfill({ json: systemStatusIncidentsFixture(reports) }) });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/ja/status/");
    const section = page.locator("#systemStatusIncidents");
    await expect(section).toHaveAttribute("data-incidents-state", "ready");
    await expect(section.locator("article")).toHaveCount(20);
    await expect(section.locator("ol > li")).toHaveCount(400);
    await noOverflow(page);
    const fitting = await section.locator("article, ol, li, .system-status-incident-message").evaluateAll((nodes) => nodes.every((node) =>
      node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1 &&
      !["hidden", "clip", "scroll", "auto"].includes(getComputedStyle(node).overflowY)));
    expect(fitting).toBe(true);
    const last = section.locator("li p").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await section.locator(".system-status-incidents-fetched").scrollIntoViewIfNeeded();
    await expect(section.locator(".system-status-incidents-fetched")).toBeInViewport();
  }
  expectClean(diagnostics);
});

test("B3 request timeout stays fail-closed and does not disturb A/B2", async ({ page }) => {
  const diagnostics = await stub(page);
  await page.goto("/en/status/");
  await expect(page.locator("#systemStatusIncidents")).toHaveAttribute("data-incidents-state", "ready");
  await page.clock.install();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (url, options) => url.endsWith("/api/system-status/incidents")
      ? new Promise((resolve) => { window.finishIncidentRequest = () => resolve({ ok: true, json: async () => ({ ok: true, source: "better_stack", reports: [], fetchedAt: "2026-08-31T12:00:00.000Z" }) }); })
      : original(url, options);
    void loadSystemStatusIncidents();
  });
  await expect(page.locator("#systemStatusIncidents")).toHaveAttribute("data-incidents-state", "loading");
  await page.clock.fastForward(6000);
  await expect(page.locator("#systemStatusIncidents")).toHaveAttribute("data-incidents-state", "error");
  await page.evaluate(() => window.finishIncidentRequest());
  await expect(page.locator("#systemStatusIncidents")).toHaveAttribute("data-incidents-state", "error");
  await expectIndependent(page);
  expectClean(diagnostics);
});
