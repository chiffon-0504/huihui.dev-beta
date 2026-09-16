import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { notFoundPaths, securityHeaders, validateNotFoundResponse, validateResponse } from "../support/v2-beta-contract.mjs";

const builtHtml = await readFile(new URL("../../v2/dist/404.html", import.meta.url), "utf8");
const expectedHeaders = securityHeaders(await readFile(new URL("../../v2/dist/_headers", import.meta.url), "utf8"));
const styles = new Set([...builtHtml.matchAll(/href="(\/assets\/[^"\s]+\.css)"/g)].map((match) => match[1]));

// Runs on the same API-verified immutable deployment and exact-SHA checkout as
// the success smoke, but never relaxes its 200-only navigation/resource guard.
for (const path of notFoundPaths) {
  test(`strict expected-404 document ${path}`, async ({ page, baseURL }) => {
    const url = new URL(path, baseURL).href;
    const errors = [];
    const pending = [];
    await page.addInitScript(() => {
      window.notFoundCspViolations = [];
      document.addEventListener("securitypolicyviolation", () => window.notFoundCspViolations.push("violation"));
    });
    page.on("pageerror", () => errors.push("Unexpected script error"));
    page.on("requestfailed", () => errors.push("Unexpected request failure"));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // Chromium reports the deliberately requested 404 as a resource error.
      const location = message.location();
      if (message.text() === "Failed to load resource: the server responded with a status of 404 (Not Found)"
        && location.url === url && location.lineNumber === 0 && location.columnNumber === 0) return;
      errors.push("Unexpected console error");
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      const target = new URL(request.url());
      const allowed = request.method() === "GET" && target.origin === new URL(baseURL).origin
        && (request.isNavigationRequest() ? request.frame() === page.mainFrame() && target.href === url
          : !target.search && styles.has(target.pathname) && request.resourceType() === "stylesheet");
      if (!allowed) { errors.push("Unexpected request outside error document"); await route.abort(); }
      else await route.fallback();
    });
    page.on("response", (response) => {
      if (response.request().isNavigationRequest()) return;
      pending.push((async () => {
        const headers = await response.allHeaders();
        validateResponse({ status: response.status(), headers, url: response.url(), redirected: Boolean(response.request().redirectedFrom()) }, response.url(), "Error document stylesheet");
        expect(headers["content-type"]).toContain("text/css");
        const path = new URL(response.url()).pathname;
        expect(await response.body()).toEqual(await readFile(new URL(`../../v2/dist${path}`, import.meta.url)));
      })().catch(() => errors.push("Error document stylesheet failed build verification")));
    });
    const response = await page.goto(url);
    validateNotFoundResponse({
      status: response.status(), headers: await response.allHeaders(), url: response.url(),
      redirected: Boolean(response.request().redirectedFrom()), html: await response.text(),
    }, url, builtHtml, expectedHeaders);
    expect(page.url()).toBe(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
    await expect(page.locator("main.not-found")).toBeVisible();
    await expect(page.locator("#app, main.home, script, nav, footer")).toHaveCount(0);
    await expect(page.getByRole("link")).toHaveCount(3);
    expect(await page.evaluate(() => window.notFoundCspViolations)).toEqual([]);
    await Promise.all(pending);
    expect(errors).toEqual([]);
  });
}
