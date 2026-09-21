import { expect, test } from "@playwright/test";
import { jpeg, remoteUrl, openViewerFixture, readV2Headers } from "../support/v2-viewer-fixture.mjs";

test("real Works: load, scroll, hover, focus and every preview request zero R2 JPGs", async ({ page, baseURL }) => {
  const remote = [];
  // Ordinary browsing must succeed even when R2 is unavailable.
  await page.route("https://assets-beta.huihui.dev/**", (route) => route.abort("failed"));
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
      await expect(page.locator(".image-viewer")).toBeVisible();
      const loadControl = page.locator(".viewer-load");
      if (await loadControl.evaluate((button) => button.hidden)) await expect(loadControl).not.toBeVisible();
      await page.locator("dialog img").evaluate((image) => image.decode());
      expect(await page.locator("dialog img").evaluate((image) =>
        new URL(image.currentSrc).origin === location.origin && new URL(image.currentSrc).pathname.endsWith(".webp"))).toBe(true);
      await expect(page.locator(".viewer-stage")).toHaveAttribute("data-mode", "preview");
      expect(remote).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.locator(".image-viewer")).not.toBeVisible();
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
  ["404", immutable], ["decode", immutable], ["timeout", immutable],
]) {
  const suffix = failureCache === immutable ? " (immutable failure response)" : "";
  test(`${failure} keeps a usable preview and disables further high-resolution actions${suffix}`, async ({ page, baseURL }) => {
    let count = 0;
    const requests = [];
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    let completed;
    const done = new Promise((resolve) => { completed = resolve; });
    let entered;
    const requested = new Promise((resolve) => { entered = resolve; });
    await page.clock.install();
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
    await page.route("https://assets-beta.huihui.dev/**", async (route) => {
      count++;
      requests.push({ url: route.request().url(), referer: route.request().headers().referer ?? null });
      entered();
      if (count > 1) return route.fulfill({ headers: { "cache-control": immutable }, contentType: "image/jpeg", body: jpeg });
      if (failure === "timeout") {
        await blocked;
        await route.fulfill({ headers: { "cache-control": immutable }, contentType: "image/jpeg", body: jpeg });
        completed();
        return;
      }
      if (failure === "network") return route.abort("failed");
      // Interception isolates image-result reuse; the native HTTP probe covers HTTP caching.
      return route.fulfill({ status: failure === "404" ? 404 : 200, headers: { "cache-control": failureCache }, contentType: "image/jpeg", body: "invalid" });
    });
    await openViewerFixture(page, baseURL);
    await page.getByRole("button", { name: "fuji", exact: true }).click();
    expect(count).toBe(0);
    expect(await page.evaluate(() => window.highResolutionAssignments)).toEqual([]);
    const preview = await page.locator("dialog img").elementHandle();
    await preview.evaluate((image) => image.decode());
    const close = page.getByRole("button", { name: "Close", exact: true });
    const load = page.locator(".viewer-load");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(load).toBeFocused();
    await page.keyboard.press("Enter");
    await requested;
    if (failure === "timeout") await page.clock.runFor(60_000);
    const error = "Could not load high-resolution image. Preview remains available.";
    await expect(page.getByRole("status")).toHaveText(error);
    await expect(page.getByRole("status")).toHaveAttribute("aria-live", "polite");
    await expect(page.locator(".viewer-stage")).toHaveAttribute("data-mode", "preview");
    await expect(page.locator(".viewer-stage")).toHaveAttribute("aria-busy", "false");
    await expect(load).toBeFocused();
    await expect(load).toBeDisabled();
    await expect(load).toHaveAccessibleName("Load high-resolution · 0.0 MB");
    await expect(page.getByRole("button", { name: /Retry/ })).toHaveCount(0);
    expect(await preview.evaluate((image) => image.isConnected && image.currentSrc.endsWith("/preview.webp") && image.naturalWidth > 0)).toBe(true);
    // Real keyboard activation and a synthetic click must both respect the disabled state.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await load.evaluate((button) => button.click());
    if (failure === "timeout") { release(); await done; }
    // Exercise the old timeout boundary without a wall-clock sleep or automatic retry.
    await page.clock.runFor(60_001);
    await expect(page.getByRole("status")).toHaveText(error);
    await expect(page.locator(".viewer-stage")).toHaveAttribute("data-mode", "preview");
    expect(await page.evaluate(() => window.highResolutionAssignments)).toEqual([{
      url: remoteUrl("fuji"), image: 1, referrerPolicy: "no-referrer", crossOrigin: null,
    }]);
    expect(requests).toEqual([{ url: remoteUrl("fuji"), referer: null }]);
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(load).toBeFocused();
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(page.locator("dialog img")).toHaveAttribute("alt", "tsutenkaku");
    await page.locator("dialog img").evaluate((image) => image.decode());
    await expect(load).toBeEnabled();
    await expect(load).toHaveText("Load high-resolution · 0.0 MB");
    expect(count).toBe(1);
    await load.click();
    await expect(page.locator(".viewer-stage")).toHaveAttribute("data-mode", "high-resolution");
    expect(count).toBe(2);
    expect(requests.at(-1)).toEqual({ url: remoteUrl("tsutenkaku"), referer: null });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "fuji", exact: true })).toBeFocused();
    const other = page.getByRole("button", { name: "shiba", exact: true });
    await other.click();
    await expect(page.locator(".viewer-stage")).toHaveAttribute("data-mode", "preview");
    await expect(page.locator("dialog img")).toHaveAttribute("alt", "shiba");
    await expect(load).toBeEnabled();
    await expect(page.getByRole("status")).toHaveText("shiba");
    expect(count).toBe(2);
    await close.click();
    await expect(other).toBeFocused();
    expect(await page.evaluate(() => window.violations)).toEqual([]);
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
