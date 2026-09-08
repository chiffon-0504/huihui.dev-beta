import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { applyPagesCsp } from "../support/csp-enforcement.mjs";

test("real PNG export recovers once under the enforcing Pages CSP", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.cspViolations.push({
        disposition: event.disposition,
        effectiveDirective: event.effectiveDirective,
        blockedURI: event.blockedURI,
      });
    });
  });
  const headers = await applyPagesCsp(page, baseURL);
  const moduleUrl = new URL("/vendor/html2canvas/html2canvas.esm.js", baseURL).href;
  const recoveryUrl = `${moduleUrl}?recovery=1`;
  const requests = [];
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  page.on("request", (request) => {
    if (request.url().startsWith(moduleUrl)) requests.push(request.url());
  });
  // Abort only the original module at the network boundary. Recovery goes
  // through the existing static server, with no replacement implementation.
  await page.route(moduleUrl, (route) => route.abort("failed"));

  const response = await page.goto("/en/tools/tier-maker/", { waitUntil: "load" });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toBe(headers["content-security-policy"]);
  await page.locator("#imageUpload").setInputFiles({
    name: "controlled.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#4f8cff"/></svg>'),
  });
  const status = page.locator("#tierStatus");
  await expect(status).toHaveText("Images added: 1.");
  const item = page.locator('.tier-item[alt="controlled.svg"]');
  await item.focus();
  await page.keyboard.press("ArrowUp");
  const placedItem = page.locator('.tier-content[aria-label="B tier"] > .tier-item');
  await expect(placedItem).toHaveCount(1);
  await expect.poll(() => placedItem.evaluate((image) => image.complete && image.naturalWidth === 16)).toBe(true);

  const button = page.locator("#saveBtn");
  const assertClean = async () => {
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute("aria-busy");
    await expect(page.locator("#tierBoard")).not.toHaveClass(/\bexporting\b/);
    await expect(page.locator(".tier-label-export")).toHaveCount(0);
    await expect(placedItem).toHaveCount(1);
  };
  expect(requests).toEqual([]);
  const failedRequest = page.waitForEvent("requestfailed", (request) => request.url() === moduleUrl);
  await button.click();
  expect((await failedRequest).failure()).toBeTruthy();
  await expect(status).toHaveText("The PNG could not be created. Please try again.");
  await assertClean();
  expect(downloads).toHaveLength(0);
  expect(requests).toEqual([moduleUrl]);
  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);

  const vendorResponse = page.waitForResponse(recoveryUrl);
  const downloadEvent = page.waitForEvent("download");
  await button.click();
  const vendor = await vendorResponse;
  expect(vendor.status()).toBe(200);
  expect(await vendor.body()).toEqual(await readFile(new URL("../../vendor/html2canvas/html2canvas.esm.js", import.meta.url)));
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("tier-list.png");
  expect(await download.failure()).toBeNull();
  const png = await readFile(await download.path());
  expect(png.length).toBeGreaterThan(8);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.toString("ascii", 12, 16)).toBe("IHDR");
  expect(png.readUInt32BE(16)).toBeGreaterThan(0);
  expect(png.readUInt32BE(20)).toBeGreaterThan(0);
  await expect(status).toHaveText("PNG download started.");
  await assertClean();
  expect(downloads).toHaveLength(1);
  expect(requests).toEqual([moduleUrl, recoveryUrl]);
  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
});
