import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { jpeg, remoteUrl, openViewerFixture, readV2Headers } from "../support/v2-viewer-fixture.mjs";

test("real Works: load, scroll, hover, focus and every preview request zero R2 JPGs", async ({ page, baseURL }) => {
  const remote = [];
  page.on("request", (request) => { if (new URL(request.url()).origin !== baseURL) remote.push(request.url()); });
  const headers = await readV2Headers();
  await page.route("**/*", async (route) => {
    if (!route.request().isNavigationRequest()) return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
  });
  for (const path of ["/works/", "/en/works/", "/ja/works/"]) {
    await page.goto(path);
    const triggers = page.locator(".image-preview");
    await expect(triggers).toHaveCount(3);
    for (const trigger of await triggers.all()) {
      await trigger.scrollIntoViewIfNeeded();
      await trigger.hover();
      await trigger.focus();
      expect(remote).toEqual([]);
      await trigger.click();
      await expect(page.locator("dialog")).toBeVisible();
      const loadControl = page.locator(".viewer-load");
      if (await loadControl.evaluate((button) => button.hidden)) await expect(loadControl).not.toBeVisible();
      await page.locator("dialog img").evaluate((image) => image.decode());
      expect(remote).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog")).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
  }
  expect(remote).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  // Every fixture image is intercepted; CI never fetches a source JPEG or R2 object.
  await page.route("https://assets-beta.huihui.dev/**", (route) => route.fulfill({ contentType: "image/jpeg", body: jpeg }));
});

test("explicit action loads only the selected JPEG; native dialog traps and restores focus", async ({ page, baseURL }) => {
  const requests = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.url().startsWith("https://assets-beta.")) requests.push(request); });
  await openViewerFixture(page, baseURL);
  for (const [index, id] of ["fuji", "tsutenkaku", "shiba"].entries()) {
    const trigger = page.getByRole("button", { name: id, exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.hover();
    await trigger.focus();
    expect(requests).toHaveLength(index);
    await trigger.click();
    expect(requests).toHaveLength(index);
    const dialog = page.getByRole("dialog");
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(".viewer-load")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    const before = requests.length;
    await expect(dialog.locator(".viewer-load")).toHaveText("Load high-resolution · 0.0 MB");
    expect(requests).toHaveLength(before);
    await dialog.locator(".viewer-load").click();
    await expect(dialog.locator(".viewer-stage")).toHaveAttribute("data-mode", "high-resolution");
    expect(requests).toHaveLength(before + 1);
    expect(requests.at(-1).url()).toBe(remoteUrl(id));
    expect(requests.at(-1).headers().referer).toBeUndefined();
    await expect(dialog.locator("img")).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(dialog.locator("img")).not.toHaveAttribute("crossorigin");
    await expect(dialog.locator(".viewer-load")).toHaveAttribute("aria-disabled", "true");
    expect(requests).toHaveLength(before + 1);
    await close.click();
    await expect(trigger).toBeFocused();
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.violations)).toEqual([]);
});

const immutable = "public, max-age=31536000, immutable";
for (const [failure, failureCache] of [
  ["404", "no-store"], ["network", "no-store"], ["decode", "no-store"],
  ["404", immutable], ["decode", immutable],
]) {
  const suffix = failureCache === immutable ? " (immutable failure response)" : "";
  test(`${failure} leaves preview usable and supports explicit retry${suffix}`, async ({ page, baseURL }, testInfo) => {
    let count = 0;
    const requests = [];
    await page.addInitScript(() => {
      window.highResolutionAssignments = [];
      const identities = new WeakMap();
      const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
      // Observe the detached loader without changing its URL or decode promise.
      Object.defineProperty(HTMLImageElement.prototype, "src", { ...src, set(value) {
        if (String(value).startsWith("https://assets-beta.huihui.dev/")) {
          if (!identities.has(this)) identities.set(this, window.highResolutionAssignments.length + 1);
          window.highResolutionAssignments.push({ url: String(value), image: identities.get(this),
            referrerPolicy: this.referrerPolicy, crossOrigin: this.crossOrigin });
        }
        src.set.call(this, value);
      } });
    });
    await page.route("https://assets-beta.huihui.dev/**", (route) => {
      count++;
      requests.push({ url: route.request().url(), referer: route.request().headers().referer ?? null });
      if (count > 1) return route.fulfill({ headers: { "cache-control": immutable }, contentType: "image/jpeg", body: jpeg });
      if (failure === "network") return route.abort("failed");
      // Interception isolates image-result reuse; the native HTTP probe covers HTTP caching.
      return route.fulfill({ status: failure === "404" ? 404 : 200, headers: { "cache-control": failureCache }, contentType: "image/jpeg", body: "invalid" });
    });
    await openViewerFixture(page, baseURL);
    await page.getByRole("button", { name: "fuji", exact: true }).click();
    expect(count).toBe(0);
    expect(await page.evaluate(() => window.highResolutionAssignments)).toEqual([]);
    await page.locator(".viewer-load").click();
    await expect(page.getByRole("status")).toContainText("Could not load");
    await expect(page.locator(".viewer-stage")).toHaveAttribute("data-mode", "preview");
    await page.locator("dialog img").evaluate((image) => image.decode());
    expect(count).toBe(1);
    await page.getByRole("button", { name: /Retry high-resolution/ }).click();
    await expect(page.locator(".viewer-stage")).toHaveAttribute("aria-busy", "false");
    const observations = await page.evaluate(() => ({
      assignments: window.highResolutionAssignments,
      mode: document.querySelector(".viewer-stage").dataset.mode,
      status: document.querySelector(".viewer-status").textContent,
      violations: window.violations,
    }));
    const evidencePath = testInfo.outputPath("same-url-retry.json");
    await writeFile(evidencePath, JSON.stringify({ platform: process.platform, browser: testInfo.project.name,
      failure, failureCache, requests, ...observations }, null, 2));
    await testInfo.attach("same-url-retry.json", { contentType: "application/json", path: evidencePath });
    expect(observations.assignments).toEqual([1, 2].map((image) => ({
      url: remoteUrl("fuji"), image, referrerPolicy: "no-referrer", crossOrigin: null,
    })));
    expect(observations.violations).toEqual([]);
    expect(requests).toEqual([1, 2].map(() => ({ url: remoteUrl("fuji"), referer: null })));
    await expect(page.locator(".viewer-stage")).toHaveAttribute("data-mode", "high-resolution");
    expect(count).toBe(2);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "fuji", exact: true })).toBeFocused();
  });
}

for (const action of ["close", "switch"]) {
  test(`${action} during load discards stale completion and resets to preview`, async ({ page, baseURL }) => {
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    let entered;
    const requested = new Promise((resolve) => { entered = resolve; });
    let completed;
    const done = new Promise((resolve) => { completed = resolve; });
    await page.route(remoteUrl("fuji"), async (route) => {
      entered();
      await blocked;
      await route.fulfill({ contentType: "image/jpeg", body: jpeg });
      completed();
    });
    await openViewerFixture(page, baseURL);
    await page.getByRole("button", { name: "fuji", exact: true }).click();
    await page.locator(".viewer-load").click();
    await requested;
    await expect(page.getByRole("status")).toContainText("Loading high-resolution");
    await expect(page.locator(".viewer-stage")).toHaveAttribute("data-mode", "preview");
    if (action === "close") {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "fuji", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "tsutenkaku", exact: true }).click();
    } else await page.getByRole("button", { name: "Next image" }).click();
    release();
    await done;
    await page.locator("dialog img").evaluate((image) => image.decode());
    await expect(page.locator("dialog img")).toHaveAttribute("alt", "tsutenkaku");
    await expect(page.locator(".viewer-stage")).toHaveAttribute("data-mode", "preview");
    await expect(page.locator(".viewer-load")).toHaveText("Load high-resolution · 0.0 MB");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
}

for (const mode of ["enforce", "report", "none"]) test(`image CSP unknown-host probe: ${mode}`, async ({ page, baseURL }) => {
  await page.route("https://unapproved.example.test/**", (route) => route.fulfill({ contentType: "image/jpeg", body: jpeg }));
  await openViewerFixture(page, baseURL, mode);
  await page.getByRole("button", { name: "Unknown host probe" }).click();
  await expect.poll(() => page.locator("body > img").evaluate((image) => image.complete)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.violations)).toEqual(mode === "none" ? [] : [{ directive: "img-src", disposition: mode }]);
  expect(await page.locator("body > img").evaluate((image) => image.naturalWidth)).toBe(mode === "enforce" ? 0 : 2);
});
