import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";
let mockSystemStatus: typeof import("../support/v2-system-status.mjs").mockSystemStatus;
test.beforeAll(async () => { ({ mockSystemStatus } = await import("../support/v2-system-status.mjs")); });
test.beforeEach(async ({ context }) => { await mockSystemStatus(context); });
const success = (probability = 0.73, remaining = 2) => ({ ok: true, probability, remaining, resetAt: Date.now() + 86400000 });

for (const locale of supportedLocales) {
  const copy = getContent(locale).home.jev;
  test(`${locale} public form validates 99 Unicode characters and sends only a question`, async ({ page }) => {
    const requests: { url: string; body: unknown }[] = [];
    await page.route("**/api/jev-public", async route => {
      requests.push({ url: route.request().url(), body: route.request().postDataJSON() });
      await route.fulfill({ json: success() });
    });
    await page.goto(localeHref(locale));
    const form = page.locator(".jev-public"), input = page.getByLabel(copy.question, { exact: true }), button = form.getByRole("button");
    await expect(page.locator("#jev-public-title")).toHaveText("Yes or NO ?");
    if (locale === "zh-Hant") await expect(input).toHaveAccessibleName("問題");
    await expect(input).toHaveJSProperty("tagName", "TEXTAREA");
    await expect(input).toHaveAttribute("aria-describedby", "jev-public-counter");
    await expect(form).toHaveAttribute("data-state", "idle");
    await expect(form.getByRole("status")).toBeEmpty();
    await expect(form.locator("p")).toHaveCount(0);
    await expect(form).toHaveText(`${copy.question}0 / 99${copy.submit}`);
    expect(requests).toEqual([]);
    await input.focus(); await page.keyboard.press("Enter");
    await expect(input).toHaveValue("\n");
    await expect(form).toHaveAttribute("data-state", "idle");
    await expect(input).toBeFocused();
    expect(requests).toEqual([]);
    await input.press("Tab"); await expect(button).toBeFocused(); await page.keyboard.press("Enter");
    await expect(form).toHaveAttribute("data-state", "invalid");
    await expect(button).toBeFocused();
    await input.fill("字".repeat(100)); await button.press("Enter");
    await expect(page.locator("#jev-public-counter")).toHaveText("100 / 99");
    await expect(input).toHaveAttribute("aria-invalid", "true"); expect(requests).toEqual([]);
    await input.fill("😀".repeat(99)); await button.press("Enter");
    await expect(page.locator("#jev-public-counter")).toHaveText("99 / 99");
    await expect(form).toHaveAttribute("data-state", "yes");
    await expect(form.getByRole("status")).toContainText("YES 73%");
    await expect(form.getByRole("status")).toContainText(`${copy.remaining} 2 / 3`);
    await expect(form.getByRole("status")).toHaveAttribute("aria-live", "polite");
    await expect(button).toBeFocused();
    expect(requests).toEqual([{ url: new URL("/api/jev-public", page.url()).href, body: { question: "😀".repeat(99) } }]);
  });
  test(`${locale} pending state prevents duplicate submits and preserves focus`, async ({ page }) => {
    let release: (() => void) | undefined;
    let calls = 0;
    await page.route("**/api/jev-public", async route => {
      calls++;
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ json: success(0.21) });
    });
    await page.goto(localeHref(locale));
    const form = page.locator(".jev-public"), input = page.getByLabel(copy.question, { exact: true }), button = form.getByRole("button");
    await input.fill("One question?");
    await input.press("Tab"); await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(form).toHaveAttribute("data-state", "loading");
    await expect(input).toHaveAttribute("readonly", "");
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await form.evaluate(node => { node.dispatchEvent(new Event("submit", { cancelable: true })); node.dispatchEvent(new Event("submit", { cancelable: true })); });
    await expect.poll(() => calls).toBe(1);
    release!();
    await expect(form).toHaveAttribute("data-state", "no");
    await expect(form.getByRole("status")).toContainText("NO 79%");
    await expect(button).toBeFocused();
    await expect(button).not.toHaveAttribute("aria-disabled", "true");
  });
  test(`${locale} remaining 2/1/0 and fourth limit recover after server expiry`, async ({ page }) => {
    let calls = 0;
    await page.route("**/api/jev-public", route => {
      calls++;
      return route.fulfill(calls === 4 ? { status: 429, json: { ok: false, error: "rate_limited", remaining: 0, resetAt: Date.now() + 1000 } }
        : { json: success(0.73, calls > 4 ? 2 : 3 - calls) });
    });
    await page.goto(localeHref(locale));
    const form = page.locator(".jev-public"), input = page.getByLabel(copy.question, { exact: true }), button = form.getByRole("button");
    await input.fill("One question?");
    for (const remaining of [2, 1, 0]) {
      await button.press("Enter");
      await expect(form.getByRole("status")).toContainText(`${copy.remaining} ${remaining} / 3`);
      await expect(form).toHaveAttribute("data-state", "yes");
    }
    await button.press("Enter"); await expect(form).toHaveAttribute("data-state", "rate_limited");
    await expect(form.getByRole("status")).toContainText(copy.limited);
    // The server decides expiry; the UI has no persistent lock or automatic retry.
    await button.press("Enter"); await expect(form).toHaveAttribute("data-state", "yes");
    await expect(form.getByRole("status")).toContainText(`${copy.remaining} 2 / 3`);
  });
  test(`${locale} sanitized invalid, busy, unavailable and malformed response states`, async ({ page }) => {
    let status = 400, body: unknown = { secret: "sensitive-provider-diagnostic" };
    await page.route("**/api/jev-public", route => route.fulfill({ status, json: body }));
    await page.goto(localeHref(locale));
    const form = page.locator(".jev-public"), input = page.getByLabel(copy.question, { exact: true }), button = form.getByRole("button");
    await input.fill("<img src=x onerror=alert(1)>");
    for (const [nextStatus, nextBody, state, text] of [
      [400, body, "invalid", copy.invalid],
      [429, { ok: false, error: "busy", remaining: 3, resetAt: null }, "busy", copy.busy],
      [503, body, "unavailable", copy.unavailable],
      [200, { ...success(), probability: 2 }, "unavailable", copy.unavailable],
    ] as const) {
      status = nextStatus; body = nextBody;
      await button.press("Enter");
      await expect(form).toHaveAttribute("data-state", state);
      await expect(form.getByRole("status")).toContainText(text);
      if (state === "invalid") await expect(input).toHaveAttribute("aria-invalid", "true");
      if (state === "unavailable") await expect(form.getByRole("status")).not.toContainText(copy.remaining);
      await expect(form).not.toContainText("sensitive-provider-diagnostic");
      await expect(form.locator("img")).toHaveCount(0);
    }
  });
  test(`${locale} widget reflows at 320px / 200% and closes without persisting the question`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(localeHref(locale));
    const item = page.locator("#jev-public"), input = page.getByLabel(copy.question, { exact: true });
    await input.fill("A synthetic private draft?");
    await page.locator("html").evaluate(node => { node.style.fontSize = "200%"; });
    await expect(item).toHaveCSS("position", "relative");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await item.evaluate(node => [...node.querySelectorAll("button, p, label")].every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
    expect(await input.evaluate(node => { const box = node.getBoundingClientRect(), form = node.closest("form")!.getBoundingClientRect(); return box.left >= form.left && box.right <= form.right; })).toBe(true);
    await item.locator(".window-close").click(); await expect(item).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain("synthetic private draft");
    await page.reload(); await expect(item).toBeVisible(); await expect(input).toHaveValue("");
  });
  test(`${locale} native textarea resize preserves its bounds, draft and window controls`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto(localeHref(locale));
    await expect(page.locator("#status [role=status]")).toHaveAttribute("data-state", "ready");
    const item = page.locator("#jev-public"), input = page.getByLabel(copy.question, { exact: true });
    await input.fill("A resizable draft?");
    await expect(input).toHaveCSS("resize", "both");
    await expect(input).toHaveCSS("overflow", "auto");
    const initial = (await input.boundingBox())!;
    expect(initial.height).toBeGreaterThanOrEqual(44);
    expect(initial.height).toBeLessThanOrEqual(48);
    const resize = async (dx: number, dy: number) => {
      await input.scrollIntoViewIfNeeded();
      const box = (await input.boundingBox())!;
      const x = box.x + box.width - 3, y = box.y + box.height - 3;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 6 }); await page.mouse.up();
    };
    await resize(-72, 80);
    await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(initial.height + 24);
    await expect.poll(async () => (await input.boundingBox())!.width).toBeLessThan(initial.width - 24);
    const narrow = (await input.boundingBox())!.width;
    await resize(100, 300);
    await expect.poll(async () => (await input.boundingBox())!.width).toBeGreaterThan(narrow + 24);
    expect(await input.evaluate(node => {
      const box = node.getBoundingClientRect(), form = node.closest("form")!.getBoundingClientRect();
      return box.right <= form.right && box.height <= parseFloat(getComputedStyle(node).maxHeight);
    })).toBe(true);
    await expect(item).not.toHaveClass(/is-dragging/);
    await expect(input).toHaveValue("A resizable draft?");
    await expect(page.locator("#jev-public-counter")).toHaveText("18 / 99");
    await expect(item.locator("form")).toHaveAttribute("data-state", "idle");
    await expect(item.getByRole("status")).toBeEmpty();
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(item).toHaveCSS("position", "relative");
    expect(await input.evaluate(node => {
      const box = node.getBoundingClientRect(), form = node.closest("form")!.getBoundingClientRect();
      return box.left >= form.left && box.right <= form.right;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await resize(-180, -180);
    await expect.poll(async () => (await input.boundingBox())!.width).toBeLessThanOrEqual(161);
    await expect.poll(async () => (await input.boundingBox())!.height).toBeLessThanOrEqual(48);
    expect(await input.evaluate(node => {
      const box = node.getBoundingClientRect(), style = getComputedStyle(node);
      return box.width >= 160 && box.height >= parseFloat(style.minHeight);
    })).toBe(true);
    await item.locator(".window-close").click(); await expect(item).toHaveCount(0);
  });
  test(`${locale} every public result keeps the unknown status and clock windows reachable`, async ({ page }) => {
    await page.route("**/api/system-status", route => route.fulfill({ status: 503, body: "unavailable" }));
    let status = 200, body: unknown = success();
    await page.route("**/api/jev-public", route => route.fulfill({ status, json: body }));
    for (const width of [1130, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(localeHref(locale));
      await expect(page.locator("#status [role=status]")).toHaveAttribute("data-state", "unknown");
      const input = page.locator("#jev-public textarea"), form = page.locator(".jev-public");
      for (const [state, nextStatus, nextBody] of [
        ["idle", 200, success()], ["yes", 200, success()], ["no", 200, success(0.2)],
        ["busy", 429, { ok: false, error: "busy", remaining: 3, resetAt: null }],
        ["rate_limited", 429, { ok: false, error: "rate_limited", remaining: 0, resetAt: Date.now() + 86400000 }],
        ["unavailable", 503, {}], ["invalid", 400, {}],
      ] as const) {
        status = nextStatus; body = nextBody;
        if (state !== "idle") { await input.fill("One?"); await form.getByRole("button").press("Enter"); }
        await expect(form).toHaveAttribute("data-state", state);
        if (await page.locator("#jev-public").evaluate(node => getComputedStyle(node).position === "absolute")) {
          await expect.poll(() => page.evaluate(() => {
            const clock = document.querySelector("#clock")!.getBoundingClientRect();
            const jev = document.querySelector("#jev-public")!.getBoundingClientRect();
            const status = document.querySelector("#status")!.getBoundingClientRect();
            return Math.min(jev.top - clock.bottom, status.top - jev.bottom);
          })).toBeGreaterThanOrEqual(8);
        }
        for (const id of ["clock", "jev-public", "status"]) {
          const title = page.locator(`#${id} .window-titlebar`);
          await title.scrollIntoViewIfNeeded();
          expect(await title.evaluate(node => {
            const r = node.getBoundingClientRect();
            return [r.left + 2, r.left + 24, r.right - 2].every(x => node.contains(document.elementFromPoint(x, r.top + r.height / 2)));
          })).toBe(true);
        }
      }
      await page.locator("#status .window-close").click();
      await expect(page.locator("#status")).toHaveCount(0);
    }
  });
}

test("closing a pending widget cancels stale results and leaves the other windows usable", async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route("**/api/jev-public", async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: success() }).catch(() => {});
  });
  await page.goto("/en/");
  const item = page.locator("#jev-public");
  await item.locator("textarea").fill("One?"); await item.locator("form button").press("Enter");
  await expect(item.locator("form")).toHaveAttribute("data-state", "loading");
  await expect.poll(() => typeof release).toBe("function");
  await item.locator(".window-close").click(); release!();
  await expect(item).toHaveCount(0);
  await expect(page.locator(".desktop-window")).toHaveCount(6);
  await expect(page.locator("#version .window-close")).toBeFocused();
});

test("public submission works under the unchanged shipped CSP", async ({ page }) => {
  const headers = await readFile("v2/public/_headers", "utf8");
  const policy = headers.match(/Content-Security-Policy:\s*([^\r\n]+)/)![1]!;
  const violations: string[] = [];
  page.on("console", message => { if (message.type() === "error") violations.push(message.text()); });
  await page.route("**/*", async route => {
    if (!route.request().isNavigationRequest()) return route.fallback();
    const response = await route.fetch();
    return route.fulfill({ response, headers: { ...response.headers(), "Content-Security-Policy": policy } });
  });
  await page.route("**/api/jev-public", route => route.fulfill({ json: success() }));
  await page.goto("/en/");
  await page.locator("#jev-public textarea").fill("One question?");
  await page.locator("#jev-public form button").press("Enter");
  await expect(page.locator(".jev-public")).toHaveAttribute("data-state", "yes");
  expect(violations).toEqual([]);
});
