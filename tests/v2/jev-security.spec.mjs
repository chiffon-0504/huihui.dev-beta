import { expect, test } from "@playwright/test";
import { privateHeaders } from "../../workers/huihui-api/jev-security.js";
import { openCspProbe } from "../support/csp-enforcement.mjs";

for (const mode of ["enforce", "report", "none"]) {
  test(`private CSP ${mode} control`, async ({ page }) => {
    const policy = privateHeaders()["Content-Security-Policy"];
    const headers = mode === "enforce" ? { "Content-Security-Policy": policy }
      : mode === "report" ? { "Content-Security-Policy-Report-Only": policy } : {};
    await openCspProbe(page, headers);
    await expect(page.locator("html")).toHaveAttribute("data-complete", "true");
    await page.getByRole("button", { name: "Allowed action" }).click();
    await expect(page.locator("output")).toHaveText("allowed interaction ran");
    await expect(page.locator("html")).toHaveAttribute("data-forbidden", mode === "enforce" ? "not-run" : "ran");
    if (mode !== "none") await expect.poll(() => page.evaluate(() => window.cspViolations)).toContainEqual({ disposition: mode, effectiveDirective: "script-src-elem", blockedURI: "inline" });
    else expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
  });
}

test("private form runs under its actual CSP and recovers from authentication failure", async ({ page, baseURL }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("401")) errors.push(message.text()); });
  await page.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== baseURL) return route.abort();
    if (request.isNavigationRequest()) {
      const response = await route.fetch();
      return route.fulfill({ response, headers: { ...response.headers(), ...privateHeaders() } });
    }
    return route.continue();
  });
  await page.route("**/api/jev", route => route.fulfill({ status: 401, json: { ok: false, error: "authentication_required" } }));
  await page.goto("/tools/jev/");
  await page.getByLabel("語言", { exact: true }).selectOption("en");
  await page.getByLabel("Question", { exact: true }).fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
  await expect(page.getByRole("link", { name: "Reload to sign in" })).toHaveAttribute("href", "/tools/jev/");
  await expect(page.getByLabel("Question", { exact: true })).toHaveValue("<img src=x onerror=alert(1)>");
  await expect(page.locator("img")).toHaveCount(0);
  expect(errors).toEqual([]);
});
