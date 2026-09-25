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
      await expect(page.locator("h1")).toHaveCount(1);
      const heading = page.getByRole("main").getByRole("heading", { level: 1 });
      await expect(heading).toHaveText(copy.home.title);
      await expect(heading).toHaveAccessibleName(copy.home.title);
      await expect(heading).not.toHaveAttribute("hidden");
      await expect(heading).toHaveCSS("position", "absolute");
      await expect(heading).toHaveCSS("clip-path", "inset(50%)");
      await expect(heading).toHaveCSS("width", "1px");
      await expect(heading).toHaveCSS("height", "1px");
      await expect(page.locator(".desktop-heading")).toHaveCount(0);
      const layout = await page.locator("main").evaluate((node) => {
        const measure = () => ({
          boxes: [node, ...node.querySelectorAll(".desktop, .desktop-window")].map((item) => item.getBoundingClientRect().toJSON()),
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        });
        const before = measure(), title = node.querySelector("h1")!;
        title.remove();
        const without = measure();
        node.prepend(title);
        return { before, without };
      });
      expect(layout.before).toEqual(layout.without);
      await expect(page.locator(".desktop-window")).toHaveCount(6);
      await expect(page.locator("#profile, .profile-user, .profile-online")).toHaveCount(0);
      await expect(page.locator(".desktop-window h2")).toHaveText([copy.home.playing, copy.home.bishoujo, copy.home.memories, copy.home.time, copy.home.status, copy.home.version]);
      await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(6);
      await expect(page.locator(".navbar-primary, .drawer-links a[href*='/works/'], .drawer-links a[href*='/about/'], .drawer-links a[href*='/posts/'], .hero")).toHaveCount(0);
      await expect(page.locator("#playing .desktop-list li")).toHaveText(["Arcaea", "BanG Dream! Our Notes"]);
      await expect(page.locator("#bishoujo .desktop-list li")).toHaveText(["Summer Pockets REFLECTION BLUE", "魔女的夜宴", "蒼之彼方的四重奏"]);
      await expect(page.locator("#bishoujo .window-content a, #bishoujo .window-content button, #bishoujo img")).toHaveCount(0);
      const photo = page.locator("#memories img");
      await expect(photo).toHaveCount(1);
      await expect(photo).toHaveAttribute("draggable", "false");
      await expect(photo).toHaveAttribute("alt", "Ave Mujica LIVE TOUR 2026『Exitus』台北追加公演DAY2");
      await expect(photo).toHaveAttribute("width", "640");
      await expect(photo).toHaveAttribute("height", "480");
      await photo.scrollIntoViewIfNeeded();
      await expect.poll(() => photo.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
      await photo.evaluate((node: HTMLImageElement) => node.decode());
      const dimensions = await photo.evaluate((node: HTMLImageElement) => ({
        natural: node.naturalWidth / node.naturalHeight,
        rendered: node.getBoundingClientRect().width / node.getBoundingClientRect().height,
        source: new URL(node.currentSrc).pathname,
      }));
      expect(dimensions.natural).toBeCloseTo(4 / 3, 2);
      expect(dimensions.rendered).toBeCloseTo(4 / 3, 2);
      expect(dimensions.source).toMatch(/^\/assets\/ave-mujica-exitus-taipei-day2-(320|640)-[\w-]+\.webp$/);
      await expect(page.locator("#memories .window-content > p")).toHaveText(["Ave Mujica LIVE TOUR 2026『Exitus』", "台北追加公演DAY2"]);
      await expect(page.locator("#memories .window-content a, #memories .window-content button, .image-viewer")).toHaveCount(0);
      await expect(page.locator("#status .window-content > p")).toHaveText(copy.home.statusUnavailable);
      await expect(page.locator("#status dd")).toHaveText([copy.home.notChecked, copy.home.notChecked]);
      await expect(page.locator("#version a")).toHaveCount(0);
      await expect(page.locator(".desktop-version")).toHaveText("V2.0.0");
      await expect(page.locator("#version .desktop-muted")).toHaveText(copy.home.development);
      await expect(page.locator(".desktop-notes li")).toHaveText([...copy.home.notes]);
      for (const item of await page.locator(".desktop-window").all()) {
        await expect(item).toHaveAccessibleName(await item.locator("h2").innerText());
        await expect(item.locator(".window-close")).toHaveAccessibleName(`${copy.home.close}: ${await item.locator("h2").innerText()}`);
        await expect(item.locator(".window-titlebar > *")).toHaveCount(2);
        await expect(item.locator(".window-titlebar button")).toHaveText(["×"]);
        await expect(item.locator(".window-movement, .window-move, .window-directions")).toHaveCount(0);
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
        const before = await position(page.locator("#playing"));
        await move(page, page.locator("#playing .window-titlebar"), 30, 60);
        expect(await position(page.locator("#playing"))).not.toEqual(before);
      }
      expect(errors).toEqual([]);
    });
  }
  for (const id of ["bishoujo", "memories"]) test(`${locale} ${id} window retains session state and reload restores defaults`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(localeHref(locale));
    const item = page.locator(`#${id}`);
    const others = () => page.locator(`.desktop-window:not(#${id})`).evaluateAll((nodes) =>
      nodes.map((node: HTMLElement) => ({ id: node.id, x: node.offsetLeft, y: node.offsetTop })));
    const storage = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    const original = await position(item), otherDefaults = await others(), saved = await storage();
    expect(otherDefaults.every(({ x, y }) => x !== original.x || y !== original.y)).toBe(true);
    await move(page, item.locator(".window-titlebar"), 48, 24);
    const moved = await position(item);
    expect(moved).toEqual({ x: original.x + 48, y: original.y + 24 });
    expect(await others()).toEqual(otherDefaults);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(item).toHaveCSS("position", "relative");
    // CSS can switch before the desktop manager handles the compact breakpoint.
    await expect.poll(() => page.locator(".desktop-window").evaluateAll((nodes) =>
      nodes.filter((node: HTMLElement) => node.style.left || node.style.top)
        .map((node: HTMLElement) => ({ id: node.id, left: node.style.left, top: node.style.top }))))
      .toEqual([]);
    await reflow(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => position(item)).toEqual(moved);
    await item.locator(".window-close").click();
    await expect(item).toHaveCount(0);
    expect(await others()).toEqual(otherDefaults);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(item).toHaveCount(0);
    await expect(page.locator(".desktop-window")).toHaveCount(5);
    expect(await storage()).toEqual(saved);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(item).toBeVisible();
    await expect.poll(() => position(item)).toEqual(original);
    expect(await others()).toEqual(otherDefaults);
    expect(await storage()).toEqual(saved);
  });
  test(`${locale} title bar keyboard movement is bounded and leaves other windows unchanged`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(localeHref(locale));
    const item = page.locator("#playing"), title = item.locator(".window-titlebar");
    const others = () => page.locator(".desktop-window:not(#playing)").evaluateAll((nodes) =>
      nodes.map((node: HTMLElement) => ({ id: node.id, x: node.offsetLeft, y: node.offsetTop })));
    const otherDefaults = await others();
    await page.evaluate(() => document.addEventListener("keydown", (event) => {
      document.documentElement.dataset.keyPrevented = String(event.defaultPrevented);
    }));
    await page.locator("main").focus();
    await page.keyboard.press("Tab");
    await expect(title).toBeFocused();
    await expect(title).toHaveAccessibleName(copy.home.playing);
    await expect(title).toHaveAccessibleDescription(copy.home.keyboardMove);
    await expect(title).toHaveCSS("outline-style", "solid");
    await expect(item).toHaveCSS("z-index", "6");
    const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    for (const [key, dx, dy] of [["ArrowUp", 0, -24], ["ArrowDown", 0, 24], ["ArrowLeft", -24, 0], ["ArrowRight", 24, 0]] as const) {
      const before = await position(item);
      await page.keyboard.press(key);
      expect(await position(item)).toEqual({ x: before.x + dx, y: before.y + dy });
      await expect(page.locator("html")).toHaveAttribute("data-key-prevented", "true");
    }
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
    const moved = await position(item);
    for (const key of ["a", "Shift+ArrowRight", "Control+ArrowLeft", "Alt+ArrowUp", "Meta+ArrowDown"]) {
      await page.keyboard.press(key);
      await expect(page.locator("html")).toHaveAttribute("data-key-prevented", "false");
      expect(await position(item)).toEqual(moved);
    }
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowUp");
    }
    expect(await position(item)).toEqual({ x: 0, y: 0 });
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowDown");
    }
    expect(await position(item)).toEqual(await item.evaluate((node: HTMLElement) => ({
      x: node.parentElement!.clientWidth - node.offsetWidth,
      y: node.parentElement!.clientHeight - node.offsetHeight,
    })));
    expect(await others()).toEqual(otherDefaults);
    const bounded = await position(item);
    await page.keyboard.press("Tab");
    await expect(item.locator(".window-close")).toBeFocused();
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      await page.keyboard.press(key);
      await expect(page.locator("html")).toHaveAttribute("data-key-prevented", "false");
      expect(await position(item)).toEqual(bounded);
    }
    await expect(page.locator(".window-movement, .window-move, .window-directions")).toHaveCount(0);
    await expect(page.locator(".window-titlebar button")).toHaveText(Array(6).fill("×"));
    await expect(page.getByText(copy.home.keyboardMove, { exact: true })).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(item).toHaveCount(0);
    expect(await others()).toEqual(otherDefaults);
  });
  test(`${locale} compact layout disables title bar keyboard movement and restores desktop focusability`, async ({ page }) => {
    await page.setViewportSize({ width: 641, height: 900 });
    await page.goto(localeHref(locale));
    await page.evaluate(() => document.addEventListener("keydown", (event) => {
      document.documentElement.dataset.keyPrevented = String(event.defaultPrevented);
    }));
    const item = page.locator("#playing"), title = item.locator(".window-titlebar");
    await page.locator("main").focus();
    await page.keyboard.press("Tab");
    await expect(title).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const moved = await position(item);
    for (const width of [640, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(title).toHaveAttribute("tabindex", "-1");
      await expect(item.locator(".window-close")).toBeFocused();
      await expect(title).toHaveAccessibleDescription("");
      await expect(title).not.toHaveAttribute("aria-keyshortcuts");
      const before = await position(item);
      // Even a programmatically focused compact title bar must not consume arrows.
      await title.focus();
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
        await page.keyboard.press(key);
        await expect(page.locator("html")).toHaveAttribute("data-key-prevented", "false");
      }
      expect(await position(item)).toEqual(before);
      await expect(item).toHaveCSS("position", "relative");
      await page.locator("main").focus();
      await page.keyboard.press("Tab");
      await expect(item.locator(".window-close")).toBeFocused();
      await reflow(page);
    }
    await page.setViewportSize({ width: 641, height: 900 });
    await expect(title).toHaveAttribute("tabindex", "0");
    await expect(title).toHaveAccessibleDescription(copy.home.keyboardMove);
    await expect.poll(() => position(item)).toEqual(moved);
    await page.keyboard.press("Shift+Tab");
    await expect(title).toBeFocused();
    await page.keyboard.press("ArrowUp");
    expect(await position(item)).toEqual({ x: moved.x, y: moved.y - 24 });
  });
  test(`${locale} mobile stacks without dragging or overflow at 320px and enlarged text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(localeHref(locale));
    const before = await position(page.locator("#playing"));
    await move(page, page.locator("#playing .window-titlebar"), 70, 80);
    expect(await position(page.locator("#playing"))).toEqual(before);
    await expect(page.locator("#playing .window-titlebar")).toHaveCSS("touch-action", "auto");
    await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
    await reflow(page);
    const boxes = await page.locator(".desktop-window").evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.top).toBeGreaterThan(boxes[i - 1]!.bottom);
    await page.locator("#clock .window-close").click();
    await expect(page.locator(".desktop-window")).toHaveCount(5);
    await expect(page.locator("#playing")).toBeVisible();
    await reflow(page);
  });
}

for (const id of ["playing", "bishoujo", "memories", "clock", "status", "version"]) {
  test(`${id} drags only by title bar; content does not move the window`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/");
    const item = page.locator(`#${id}`);
    const original = await position(item);
    await move(page, item.locator(".window-content"), 24, 16);
    expect(await position(item)).toEqual(original);
    await move(page, item.locator(".window-titlebar"), -24, 24);
    const moved = await position(item);
    expect(moved.x).toBeCloseTo(original.x - 24, 0);
    expect(moved.y).toBeCloseTo(original.y + 24, 0);
    await expect(item).not.toHaveClass(/is-dragging/);
    if (id === "playing") {
      await item.locator(".desktop-list li:first-child").dblclick({ position: { x: 12, y: 12 } });
      expect(await page.evaluate(() => getSelection()?.toString().length)).toBeGreaterThan(0);
    }
  });
}

test("pointer and keyboard focus raise windows with bounded z-index and visible overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/");
  const music = page.locator("#playing");
  const clock = page.locator("#clock");
  const a = (await music.boundingBox())!, b = (await clock.boundingBox())!;
  await move(page, music.locator(".window-titlebar"), b.x - a.x + 40, b.y - a.y + 40);
  await expect(music).toHaveCSS("z-index", "6");
  await clock.locator("h2").click();
  await expect(clock).toHaveCSS("z-index", "6");
  expect(await page.evaluate(() => {
    const r = document.querySelector("#playing")!.getBoundingClientRect();
    return document.elementFromPoint(r.x + 20, r.y + 20)?.closest(".desktop-window")?.id;
  })).toBe("clock");
  for (let i = 0; i < 12; i++) {
    await music.locator(".window-close").focus();
    await clock.locator(".window-close").focus();
  }
  expect(await page.locator(".desktop-window").evaluateAll((nodes) => nodes.map((node) => Number(getComputedStyle(node).zIndex)).sort())).toEqual([1, 2, 3, 4, 5, 6]);
});

test("close affects one window; reload restores all defaults without storage", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/");
  const storage = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const baselineStorage = await storage();
  const positions = () => page.locator(".desktop-window").evaluateAll((nodes) => nodes.map((node: HTMLElement) => ({ id: node.id, x: node.offsetLeft, y: node.offsetTop })));
  const defaults = await positions();
  await move(page, page.locator("#playing .window-titlebar"), 150, 80);
  await page.locator("#clock .window-close").click();
  await expect(page.locator("#clock")).toHaveCount(0);
  await expect(page.locator(".desktop-window")).toHaveCount(5);
  expect(await positions()).not.toEqual(defaults);
  expect(await storage()).toEqual(baselineStorage);
  await page.reload();
  await expect(page.locator(".desktop-window")).toHaveCount(6);
  await expect.poll(positions).toEqual(defaults);
  expect(await storage()).toEqual(baselineStorage);
});

test("window boundaries survive dragging and viewport mode changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/");
  const playing = page.locator("#playing");
  await move(page, playing.locator(".window-titlebar"), -5000, -5000);
  expect(await position(playing)).toEqual({ x: 0, y: 0 });
  await move(page, playing.locator(".window-titlebar"), 5000, 5000);
  for (const width of [1440, 700, 390, 900]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(playing).toHaveCSS("position", width <= 640 ? "relative" : "absolute");
    await expect.poll(() => page.locator(".desktop-window").evaluateAll((nodes) => nodes.every((node) => {
      const r = node.getBoundingClientRect(), canvas = node.parentElement!.getBoundingClientRect();
      return r.left >= canvas.left && r.right <= canvas.right + 1 && r.top >= canvas.top && r.bottom <= canvas.bottom + 1;
    }))).toBe(true);
    await reflow(page);
  }
});

test("pointer cancellation releases the drag and secondary clicks do not drag", async ({ page }) => {
  await page.goto("/en/");
  const title = page.locator("#playing .window-titlebar");
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await title.evaluate((node) => node.addEventListener("pointerdown", (event) => { (window as any).dragPointerId = (event as PointerEvent).pointerId; }, { once: true }));
  await page.mouse.down();
  await expect(page.locator("#playing")).toHaveClass(/is-dragging/);
  await title.dispatchEvent("pointercancel", { pointerId: await page.evaluate(() => (window as any).dragPointerId) });
  await expect(page.locator("#playing")).not.toHaveClass(/is-dragging/);
  const stopped = await position(page.locator("#playing"));
  await page.mouse.move(box.x + 70, box.y + 70);
  await page.mouse.up();
  expect(await position(page.locator("#playing"))).toEqual(stopped);
  await title.dispatchEvent("pointerdown", { pointerId: 2, isPrimary: true, button: 2 });
  await expect(page.locator("#playing")).not.toHaveClass(/is-dragging/);
});

test("native keyboard skip, close buttons and final focus remain usable", async ({ page }) => {
  await page.goto("/en/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  for (const id of ["playing", "bishoujo", "memories", "clock", "status", "version"]) {
    await page.keyboard.press("Tab");
    await expect(page.locator(`#${id} .window-titlebar`)).toBeFocused();
    await expect(page.locator(`#${id} .window-titlebar`)).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Tab");
    await expect(page.locator(`#${id} .window-close`)).toBeFocused();
    await expect(page.locator(`#${id}`)).toHaveCSS("z-index", "6");
    await expect(page.locator(`#${id} .window-close`)).toHaveCSS("outline-style", "solid");
  }
  for (let remaining = 5; remaining >= 0; remaining--) {
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
