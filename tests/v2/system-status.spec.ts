import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";
import { systemStatusValues } from "../../v2/src/services/system-status";
let statusFixture: typeof import("../support/v2-system-status.mjs").statusFixture;
let statusEndpoint: string;
test.beforeAll(async () => { ({ statusFixture, statusEndpoint } = await import("../support/v2-system-status.mjs")); });

for (const locale of supportedLocales) {
  for (const status of systemStatusValues) {
    test(`${locale} renders ${status} independently by ID`, async ({ page }) => {
      const copy = getContent(locale).home;
      await page.route(statusEndpoint, (route) => route.fulfill({ json: statusFixture(status) }));
      await page.goto(localeHref(locale));
      const surface = page.locator("#status [role=status]");
      await expect(surface).toHaveAttribute("data-state", "ready");
      await expect(surface).toHaveAttribute("aria-busy", "false");
      await expect(surface.locator("p")).toHaveText(`● ${status === "operational" ? copy.statusHealthy : copy.statusLabels[status]}`);
      await expect(surface.locator('[data-component="website"]')).toHaveAttribute("data-status", status);
      await expect(surface.locator('[data-component="api"]')).toHaveAttribute("data-status", "operational");
      await expect(surface.locator("dd")).toHaveText([`● ${copy.statusLabels[status]}`, `● ${copy.statusLabels.operational}`]);
      await expect(surface.locator("dt")).toHaveText([copy.website, "API"]);
      for (const theme of ["light", "dark"]) {
        await page.locator("html").evaluate((node, theme) => { node.dataset.theme = theme; }, theme);
        const dot = surface.locator("p .status-dot");
        await expect(dot).toHaveCSS("color", status === "operational" ? "rgb(40, 150, 87)" : status === "major_outage" ? "rgb(215, 75, 75)" : status === "unknown" ? theme === "dark" ? "rgb(184, 184, 184)" : "rgb(91, 98, 93)" : "rgb(168, 121, 0)");
      }
      await page.setViewportSize({ width: 320, height: 900 });
      await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
      await surface.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test("shows loading, uses API overall including unseen Contact, and closes normally", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(statusEndpoint, async (route) => {
    await gate;
    const data = statusFixture("operational"); data.status = "major_outage"; data.components[1]!.status = "major_outage";
    await route.fulfill({ json: data });
  });
  await page.goto("/en/");
  const surface = page.locator("#status [role=status]");
  await expect(surface).toHaveAttribute("data-state", "loading");
  await expect(surface).toHaveAttribute("aria-busy", "true");
  await expect(surface.locator("p")).toHaveText("● Checking status…");
  release();
  await expect(surface.locator("p")).toHaveText("● Major outage");
  await expect(surface.locator("dd")).toHaveText(["● Operational", "● Operational"]);
  await page.locator("#status .window-close").click();
  await expect(page.locator("#status")).toHaveCount(0);
});

for (const failure of ["http", "network", "json", "missing", "duplicate", "unsupported", "timeout"]) {
  test(`fails closed and remains usable after ${failure}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install();
    await page.route(statusEndpoint, async (route) => {
      if (failure === "timeout") return;
      if (failure === "network") return route.abort("failed");
      if (failure === "http") return route.fulfill({ status: 503, body: "unavailable" });
      if (failure === "json") return route.fulfill({ contentType: "application/json", body: "{" });
      const data = statusFixture();
      if (failure === "missing") data.components.pop();
      if (failure === "duplicate") data.components[1]!.id = "api";
      if (failure === "unsupported") data.components[1]!.status = "healthy";
      return route.fulfill({ json: data });
    });
    await page.goto("/en/");
    if (failure === "timeout") {
      await expect(page.locator("#status [role=status]")).toHaveAttribute("data-state", "loading");
      await page.clock.fastForward(6000);
    }
    await expect(page.locator("#status [role=status]")).toHaveAttribute("data-state", "unknown");
    await expect(page.locator("#status dd")).toHaveText(["● Unknown / unavailable", "● Unknown / unavailable"]);
    await page.locator("#status .window-close").click();
    await expect(page.locator("#status")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("pagehide cancels; persisted pageshow requests fresh data; a closed window stays closed", async ({ page }) => {
  let calls = 0;
  await page.route(statusEndpoint, (route) => { calls++; return route.fulfill({ json: statusFixture(calls === 1 ? "operational" : "partial_outage") }); });
  await page.goto("/en/");
  await expect(page.locator("#status p")).toHaveAttribute("data-status", "operational");
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect(page.locator("#status p")).toHaveAttribute("data-status", "partial_outage");
  expect(calls).toBe(2);
  await page.locator("#status .window-close").click();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.locator("#status")).toHaveCount(0);
  expect(calls).toBe(2);
});

for (const mode of ["enforce", "report", "none"]) {
  test(`exact connect-src allows beta and rejects unapproved origin: ${mode}`, async ({ page }) => {
    await page.route("**/en/about/", async (route) => {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      // Ordinary Vite preview does not deliver Pages _headers. Apply the actual
      // repository policy to this isolated response, as in existing CSP probes.
      const policy = (await readFile("v2/public/_headers", "utf8")).match(/Content-Security-Policy: (.+)/)![1]!.trim();
      expect(policy).toContain("connect-src 'self' https://huihui-api-beta.huihuigames01.workers.dev;");
      delete headers["content-security-policy"];
      if (mode !== "none") headers[mode === "enforce" ? "content-security-policy" : "content-security-policy-report-only"] = policy;
      await route.fulfill({ response, headers });
    });
    await page.route("https://**/api/system-status", (route) => route.fulfill({ json: statusFixture() }));
    await page.addInitScript(() => {
      (window as any).statusViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => (window as any).statusViolations.push({ directive: event.effectiveDirective, disposition: event.disposition, blocked: event.blockedURI }));
    });
    await page.goto("/en/about/");
    const fetchable = (url: string) => page.evaluate((url) => fetch(url).then(() => true, () => false), url);
    expect(await fetchable(statusEndpoint)).toBe(true);
    expect(await fetchable("https://api.huihui.dev/api/system-status")).toBe(mode !== "enforce");
    if (mode !== "none") await expect.poll(() => page.evaluate(() => (window as any).statusViolations)).toContainEqual({ directive: "connect-src", disposition: mode, blocked: "https://api.huihui.dev/api/system-status" });
    else expect(await page.evaluate(() => (window as any).statusViolations)).toEqual([]);
  });
}
