import { expect, test } from "@playwright/test";
import { openCspProbe } from "../support/csp-enforcement.mjs";

const locales = [
  { route: "/", lang: "zh-Hant", light: "淺色", dark: "深色", auto: "自動" },
  { route: "/en/", lang: "en", light: "Light", dark: "Dark", auto: "Auto" },
  { route: "/ja/", lang: "ja", light: "ライト", dark: "ダーク", auto: "自動" },
];

for (const locale of locales) {
  for (const width of [1440, 390]) {
    test(`${locale.lang} live built application at ${width}px`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(new Date("2026-09-12T23:00:00+08:00"));
      await page.addInitScript(() => {
        window.previewObservations = { firstContent: null, violations: [] };
        document.addEventListener("securitypolicyviolation", (event) => {
          window.previewObservations.violations.push(event.effectiveDirective);
        });
        const observer = new MutationObserver(() => {
          if (!document.querySelector("#app > *")) return;
          window.previewObservations.firstContent = {
            theme: document.documentElement.dataset.theme,
            colorScheme: getComputedStyle(document.documentElement).colorScheme,
          };
          observer.disconnect();
        });
        observer.observe(document, { subtree: true, childList: true });
      });
      const errors = [];
      const forbidden = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      // Enforce the no-Contact/no-unrelated-API boundary before any request leaves.
      await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== new URL(baseURL).origin || request.method() !== "GET" || url.pathname.startsWith("/api/")) {
          forbidden.push(request.url());
          await route.abort();
        } else {
          await route.continue();
        }
      });
      const response = await page.goto(locale.route);
      expect(response.status()).toBe(200);
      const csp = response.headers()["content-security-policy"];
      expect(csp).toContain("script-src 'self';");
      expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
      await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
      expect(await page.evaluate(() => window.previewObservations.firstContent)).toEqual({ theme: "dark", colorScheme: "dark" });
      const assets = await page.locator("script[src], link[rel=stylesheet]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") || node.getAttribute("href")));
      expect(assets.some((asset) => /\/assets\/.*\.css$/.test(asset))).toBe(true);
      expect(assets.some((asset) => /\/assets\/theme-bootstrap-.*\.js$/.test(asset))).toBe(true);
      for (const asset of assets) expect(asset).toMatch(/^\/assets\/[\w.-]+\.(js|css)$/);
      expect(await page.evaluate(() => [...document.styleSheets].some((sheet) => sheet.cssRules.length > 0))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const [label, effective] of [[locale.light, "light"], [locale.dark, "dark"], [locale.auto, "dark"]]) {
        await page.locator(".theme-trigger").click();
        await page.getByRole("menuitemradio", { name: label, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", effective);
        await expect(page.locator("html")).toHaveCSS("color-scheme", effective);
      }
      await page.screenshot({ path: testInfo.outputPath(`${locale.lang}-${width}-auto-dark.png`), fullPage: true });
      expect(await page.evaluate(() => window.previewObservations.violations)).toEqual([]);
      await page.locator(".language-switcher summary").click();
      const destination = locale.lang === "en" ? "/ja/" : "/en/";
      await page.locator(`.language-switcher a[href="${destination}"]`).click();
      await expect(page).toHaveURL(new URL(destination, baseURL).href);
      await expect(page.getByRole("main")).toBeVisible();
      expect(errors).toEqual([]);
      expect(forbidden).toEqual([]);
    });
  }
}

for (const mode of ["enforce", "report", "none"]) {
  test(`served preview CSP probe: ${mode}`, async ({ page, request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const policy = response.headers()["content-security-policy"];
    expect(policy).toContain("script-src 'self';");
    const headers = mode === "none" ? {} : { [mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"]: policy };
    // Only the isolated probe gets a policy override; live responses above are unmodified.
    await openCspProbe(page, headers);
    await expect(page.locator("html")).toHaveAttribute("data-complete", "true");
    await expect(page.locator("html")).toHaveAttribute("data-forbidden", mode === "enforce" ? "not-run" : "ran");
    await page.getByRole("button").click();
    await expect(page.locator("output")).toHaveText("allowed interaction ran");
    const violations = await page.evaluate(() => window.cspViolations);
    if (mode === "none") expect(violations).toEqual([]);
    else expect(violations).toEqual(expect.arrayContaining([expect.objectContaining({ disposition: mode, blockedURI: "inline" })]));
  });
}
