import { expect, test } from "@playwright/test";
import { openCspProbe } from "../support/csp-enforcement.mjs";
import { readFile } from "node:fs/promises";
import { PROJECT, REPOSITORY, validateSha } from "../scripts/v2-preview-deployment.mjs";
import { securityHeaders } from "../support/v2-preview-contract.mjs";
import { checkBrowserManifest, checkNavigation, guardBrowser, navigate } from "./browser.mjs";

const expectedManifest = { project: PROJECT, repository: REPOSITORY, sha: validateSha(process.env.TARGET_SHA) };
const expectedHeaders = securityHeaders(await readFile(new URL("../../v2/public/_headers", import.meta.url), "utf8"));

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
      const checkErrors = await guardBrowser(page, baseURL);
      await navigate(page, new URL(locale.route, baseURL).href, expectedHeaders);
      await checkBrowserManifest(page, expectedManifest, expectedHeaders);
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
      const navigation = page.waitForResponse((response) => response.request().isNavigationRequest() && response.request().frame() === page.mainFrame());
      await page.locator(`.language-switcher a[href="${destination}"]`).click();
      await checkNavigation(await navigation, new URL(destination, baseURL).href, expectedHeaders);
      await expect(page).toHaveURL(new URL(destination, baseURL).href);
      await expect(page.getByRole("main")).toBeVisible();
      checkErrors();
    });
  }
}

for (const mode of ["enforce", "report", "none"]) {
  test(`served preview CSP probe: ${mode}`, async ({ page, baseURL, context }) => {
    const checkErrors = await guardBrowser(page, baseURL);
    const delivered = await navigate(page, new URL("/", baseURL).href, expectedHeaders);
    await expect(page.getByRole("main")).toBeVisible();
    checkErrors();
    const policy = delivered["content-security-policy"];
    const headers = mode === "none" ? {} : { [mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"]: policy };
    // Only the isolated probe gets a policy override; live responses above are unmodified.
    const probe = await context.newPage();
    await openCspProbe(probe, headers);
    await expect(probe.locator("html")).toHaveAttribute("data-complete", "true");
    await expect(probe.locator("html")).toHaveAttribute("data-forbidden", mode === "enforce" ? "not-run" : "ran");
    await probe.getByRole("button").click();
    await expect(probe.locator("output")).toHaveText("allowed interaction ran");
    const violations = await probe.evaluate(() => window.cspViolations);
    if (mode === "none") expect(violations).toEqual([]);
    else expect(violations).toEqual(expect.arrayContaining([expect.objectContaining({ disposition: mode, blockedURI: "inline" })]));
    await probe.close();
    checkErrors();
  });
}
