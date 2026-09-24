import { expect, test, type Locator, type Page } from "@playwright/test";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";

async function move(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 24, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 24 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}
const position = (item: Locator) => item.evaluate((node: HTMLElement) => ({ x: node.offsetLeft, y: node.offsetTop }));
async function reflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".window-content, .window-titlebar h2, .desktop-time").evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth).map((node) => node.textContent))).toEqual([]);
}

for (const locale of supportedLocales) {
  const copy = getContent(locale);
  for (const width of [1440, 768, 390]) {
    test(`${locale} desktop windows, controls and themes at ${width}px`, async ({ page, baseURL }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("requestfailed", (request) => errors.push(request.url()));
      page.on("request", (request) => { if (new URL(request.url()).origin !== new URL(baseURL!).origin) errors.push(request.url()); });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(localeHref(locale));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.home.title);
      await expect(page.locator(".desktop-window")).toHaveCount(5);
      await expect(page.locator(".desktop-window h2")).toHaveText([copy.home.profile, copy.home.playing, copy.home.time, copy.home.status, copy.home.version]);
      await expect(page.locator(".navbar-primary, .drawer-links a[href*='/works/'], .drawer-links a[href*='/about/'], .drawer-links a[href*='/posts/'], .hero")).toHaveCount(0);
      await expect(page.locator(".desktop-list li")).toHaveText(["Arcaea", "BanG Dream!", "QR Notes"]);
      await expect(page.locator("#status .window-content > p")).toHaveText(copy.home.statusUnavailable);
      await expect(page.locator("#status dd")).toHaveText([copy.home.notChecked, copy.home.notChecked]);
      await expect(page.locator("#version a")).toHaveAttribute("href", "https://github.com/chiffon-0504/huihui.dev-beta");
      for (const item of await page.locator(".desktop-window").all()) {
        await expect(item).toHaveAccessibleName(await item.locator("h2").innerText());
        await expect(item.locator(".window-close")).toHaveAccessibleName(`${copy.home.close}: ${await item.locator("h2").innerText()}`);
        if (width <= 640) await expect(item.locator(".window-movement")).toBeHidden();
        else {
          await expect(item.locator(".window-move")).toBeVisible();
          await expect(item.locator(".window-move")).toHaveAccessibleName(`${copy.home.move.label}: ${await item.locator("h2").innerText()}`);
        }
        await expect(item).toHaveCSS("position", width <= 640 ? "relative" : "absolute");
      }
      for (const theme of ["light", "dark", "auto"] as const) {
        await page.locator(".theme-trigger").click();
        await page.getByRole("menuitemradio", { name: copy[theme === "auto" ? "themeAuto" : theme === "light" ? "themeLight" : "themeDark"], exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "auto" ? /^(light|dark)$/ : theme);
        await reflow(page);
        if (theme !== "auto" && testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath(`desktop-${locale}-${width}-${theme}.png`), fullPage: true });
      }
      if (width === 768) {
        const before = await position(page.locator("#profile"));
        await move(page, page.locator("#profile .window-titlebar"), 30, 60);
        expect(await position(page.locator("#profile"))).not.toEqual(before);
      }
      expect(errors).toEqual([]);
    });
  }
  test(`${locale} mobile stacks without dragging or overflow at 320px and enlarged text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(localeHref(locale));
    const before = await position(page.locator("#profile"));
    await move(page, page.locator("#profile .window-titlebar"), 70, 80);
    expect(await position(page.locator("#profile"))).toEqual(before);
    await expect(page.locator("#profile .window-titlebar")).toHaveCSS("touch-action", "auto");
    await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
    await reflow(page);
    const boxes = await page.locator(".desktop-window").evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.top).toBeGreaterThan(boxes[i - 1]!.bottom);
    await page.locator("#playing .window-close").click();
    await expect(page.locator(".desktop-window")).toHaveCount(4);
    await expect(page.locator("#profile")).toBeVisible();
    await reflow(page);
  });
}

test("all windows drag only by title bar; content selects text and keeps links usable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/");
  for (const id of ["profile", "playing", "clock", "status", "version"]) {
    const item = page.locator(`#${id}`);
    const original = await position(item);
    await move(page, item.locator(".window-content"), 24, 16);
    expect(await position(item)).toEqual(original);
    await move(page, item.locator(".window-titlebar"), -24, 24);
    const moved = await position(item);
    expect(moved.x).toBeCloseTo(original.x - 24, 0);
    expect(moved.y).toBeCloseTo(original.y + 24, 0);
    await expect(item).not.toHaveClass(/is-dragging/);
  }
  await page.locator(".profile-user").dblclick({ position: { x: 12, y: 12 } });
  expect(await page.evaluate(() => getSelection()?.toString().length)).toBeGreaterThan(0);
  await page.locator("#version a").click({ trial: true });
});

test("pointer and keyboard focus raise windows with bounded z-index and visible overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/");
  const profile = page.locator("#profile");
  const playing = page.locator("#playing");
  const a = (await profile.boundingBox())!, b = (await playing.boundingBox())!;
  await move(page, profile.locator(".window-titlebar"), b.x - a.x + 40, b.y - a.y + 40);
  await expect(profile).toHaveCSS("z-index", "5");
  await playing.locator("h2").click();
  await expect(playing).toHaveCSS("z-index", "5");
  expect(await page.evaluate(() => {
    const r = document.querySelector("#profile")!.getBoundingClientRect();
    return document.elementFromPoint(r.x + 20, r.y + 20)?.closest(".desktop-window")?.id;
  })).toBe("playing");
  for (let i = 0; i < 12; i++) {
    await profile.locator(".window-close").focus();
    await playing.locator(".window-close").focus();
  }
  expect(await page.locator(".desktop-window").evaluateAll((nodes) => nodes.map((node) => Number(getComputedStyle(node).zIndex)).sort())).toEqual([1, 2, 3, 4, 5]);
});

test("close affects one window; reload restores all defaults without storage", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/");
  const storage = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const baselineStorage = await storage();
  const positions = () => page.locator(".desktop-window").evaluateAll((nodes) => nodes.map((node: HTMLElement) => ({ id: node.id, x: node.offsetLeft, y: node.offsetTop })));
  const defaults = await positions();
  await move(page, page.locator("#profile .window-titlebar"), 150, 80);
  await page.locator("#playing .window-close").click();
  await expect(page.locator("#playing")).toHaveCount(0);
  await expect(page.locator(".desktop-window")).toHaveCount(4);
  expect(await positions()).not.toEqual(defaults);
  expect(await storage()).toEqual(baselineStorage);
  await page.reload();
  await expect(page.locator(".desktop-window")).toHaveCount(5);
  await expect.poll(positions).toEqual(defaults);
  expect(await storage()).toEqual(baselineStorage);
});

test("window boundaries survive dragging and viewport mode changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/");
  const profile = page.locator("#profile");
  await move(page, profile.locator(".window-titlebar"), -5000, -5000);
  expect(await position(profile)).toEqual({ x: 0, y: 0 });
  await move(page, profile.locator(".window-titlebar"), 5000, 5000);
  for (const width of [1440, 700, 390, 900]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(profile).toHaveCSS("position", width <= 640 ? "relative" : "absolute");
    await expect.poll(() => page.locator(".desktop-window").evaluateAll((nodes) => nodes.every((node) => {
      const r = node.getBoundingClientRect(), canvas = node.parentElement!.getBoundingClientRect();
      return r.left >= canvas.left && r.right <= canvas.right + 1 && r.top >= canvas.top && r.bottom <= canvas.bottom + 1;
    }))).toBe(true);
    await reflow(page);
  }
});

test("pointer cancellation releases the drag and secondary clicks do not drag", async ({ page }) => {
  await page.goto("/en/");
  const title = page.locator("#profile .window-titlebar");
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await title.evaluate((node) => node.addEventListener("pointerdown", (event) => { (window as any).dragPointerId = (event as PointerEvent).pointerId; }, { once: true }));
  await page.mouse.down();
  await expect(page.locator("#profile")).toHaveClass(/is-dragging/);
  await title.dispatchEvent("pointercancel", { pointerId: await page.evaluate(() => (window as any).dragPointerId) });
  await expect(page.locator("#profile")).not.toHaveClass(/is-dragging/);
  const stopped = await position(page.locator("#profile"));
  await page.mouse.move(box.x + 70, box.y + 70);
  await page.mouse.up();
  expect(await position(page.locator("#profile"))).toEqual(stopped);
  await title.dispatchEvent("pointerdown", { pointerId: 2, isPrimary: true, button: 2 });
  await expect(page.locator("#profile")).not.toHaveClass(/is-dragging/);
});

test("native keyboard skip, content link, close buttons and final focus remain usable", async ({ page }) => {
  await page.goto("/en/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  for (const id of ["profile", "playing", "clock", "status", "version"]) {
    await page.keyboard.press("Tab");
    await expect(page.locator(`#${id} .window-move`)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(`#${id} .window-close`)).toBeFocused();
    await expect(page.locator(`#${id}`)).toHaveCSS("z-index", "5");
    await expect(page.locator(`#${id} .window-close`)).toHaveCSS("outline-style", "solid");
  }
  await page.keyboard.press("Tab");
  await expect(page.locator("#version a")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  for (let remaining = 4; remaining >= 0; remaining--) {
    await page.keyboard.press("Enter");
    await expect(page.locator(".desktop-window")).toHaveCount(remaining);
    if (remaining) expect(await page.evaluate(() => document.activeElement?.className)).toBe("window-close");
  }
  await expect(page.locator("main")).toBeFocused();
});

for (const timezoneId of ["Asia/Taipei", "America/New_York"]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test("clock follows local time through midnight and stops after closing", async ({ page }) => {
      const instant = timezoneId === "Asia/Taipei" ? "2026-09-24T23:59:59+08:00" : "2026-09-24T23:59:59-04:00";
      await page.clock.install({ time: new Date(instant) });
      await page.clock.pauseAt(new Date(instant));
      await page.goto("/en/");
      await expect(page.locator(".desktop-date")).toHaveText("2026 / 9 / 24");
      await expect(page.locator(".desktop-time")).toHaveText("23 : 59 : 59");
      await page.clock.runFor(1000);
      await expect(page.locator(".desktop-date")).toHaveText("2026 / 9 / 25");
      await expect(page.locator(".desktop-time")).toHaveText("00 : 00 : 00");
      await page.evaluate(() => { (window as any).closedClock = document.querySelector(".desktop-clock"); });
      await page.locator("#clock .window-close").click();
      const stopped = await page.evaluate(() => (window as any).closedClock.dateTime);
      await page.clock.runFor(5000);
      expect(await page.evaluate(() => (window as any).closedClock.dateTime)).toBe(stopped);
    });
  });
}
