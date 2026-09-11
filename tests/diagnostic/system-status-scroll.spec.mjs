// DIAGNOSTIC ONLY — DO NOT MERGE. Exact release populated-case copy.
import { observe, mark, save } from './scroll-observer.mjs';
import { expect, test } from "@playwright/test";
import { systemStatusFixture, systemStatusHistoryFixture, systemStatusIncidentsFixture, systemStatusIncidentReport } from "../support/system-status.mjs";

const viewports = [{ width: 1440, height: 900 }];
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

function publicIncidentUrl(url) {
  return `https://status.huihui.dev${new URL(url).pathname}`;
}

async function noOverflow(page) {
  expect(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function expectIndependent(page) {
  await expect(page.locator(".system-status-detail")).toHaveAttribute("data-status", "operational");
  await expect(page.locator("#systemStatusHistory")).toHaveAttribute("data-history-state", "ready");
  await expect(page.locator(".system-status-history-cell[data-status='major_outage']")).toHaveCount(3);
}


test.use({timezoneId:'America/Los_Angeles'});
for (const copy of locales) for(let iteration=0; iteration<(copy.locale==='ja'?40:20); iteration++) {
 test(copy.locale+' iteration '+iteration, async({page},testInfo)=>{
  await page.addInitScript(observe);
  try {
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
          await expect(article.getByRole("link", { name: `${copy.link}: ${report.title}`, exact: true })).toHaveAttribute("href", publicIncidentUrl(report.url));
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
        await mark(page, 'focus:before');
        await firstLink.focus();
        await mark(page, 'focus:after');
        await mark(page, 'ArrowRight:before');
        await page.keyboard.press("ArrowRight");
        await mark(page, 'ArrowRight:after');
        await expect(firstLink).toBeFocused();
        expect(await firstLink.evaluate((node) => node.tabIndex)).toBe(0);
        expect(await firstLink.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
        expect(await firstLink.evaluate((node) => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThan(0);
        await mark(page, 'scrollIntoView:before');
        await firstLink.scrollIntoViewIfNeeded();
        await mark(page, 'scrollIntoView:after');
        await mark(page, 'assertion:before');
        await expect(firstLink).toBeInViewport();
        await mark(page, 'assertion:after');

      }
      expectClean(diagnostics);
  } finally { await save(page,testInfo,{locale:copy.locale,iteration}); }
 });
}
