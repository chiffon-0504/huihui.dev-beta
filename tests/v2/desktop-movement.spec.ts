import { expect, test, type Locator, type Page } from "@playwright/test";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";

const position = (item: Locator) => item.evaluate((node: HTMLElement) => ({ x: node.offsetLeft, y: node.offsetTop }));
async function tabTo(page: Page, target: Locator) {
  const limit = await page.locator("a[href]:visible, button:visible, summary:visible").count();
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((node) => node === document.activeElement)) break;
  }
  await expect(target).toBeFocused();
  await expect(target).toHaveCSS("outline-style", "solid");
}

for (const locale of supportedLocales) {
  test(`${locale} Move is natively keyboard reachable on every window and each direction moves 24px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(localeHref(locale));
    const copy = getContent(locale).home;
    for (const id of ["profile", "playing", "clock", "status", "version"]) {
      const item = page.locator(`#${id}`);
      const title = await item.locator("h2").innerText();
      const toggle = item.getByRole("button", { name: `${copy.move.label}: ${title}`, exact: true });
      await tabTo(page, toggle);
      await expect(item).toHaveCSS("z-index", "5");
      const before = await position(item);
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(await position(item)).toEqual(before);
      const group = item.getByRole("group", { name: `${copy.move.label}: ${title}`, exact: true });
      await expect(group).toBeVisible();
      expect(await toggle.getAttribute("aria-controls")).toBe(await group.getAttribute("id"));
      for (const [direction, dx, dy, key] of [
        ["up", 0, -24, "Enter"], ["down", 0, 24, "Space"],
        ["left", -24, 0, "Enter"], ["right", 24, 0, "Space"],
      ] as const) {
        await page.keyboard.press("Tab");
        const button = group.getByRole("button", { name: `${copy.move[direction]}: ${title}`, exact: true });
        await expect(button).toBeFocused();
        await expect(button).toHaveCSS("outline-style", "solid");
        // Profile starts away from all boundaries; other windows verify the
        // same localized controls without assuming room for an unclamped step.
        if (id === "profile") {
          const from = await position(item);
          await page.keyboard.press(key);
          expect(await position(item)).toEqual({ x: from.x + dx, y: from.y + dy });
          await expect(button).toBeFocused();
          await expect(item).not.toHaveClass(/is-dragging/);
        }
      }
      await page.keyboard.press("Escape");
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Space");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Space");
      await expect(group).toBeHidden();
    }
  });
}

for (const touch of [false, true]) {
  test(`Move buttons support ${touch ? "touch" : "pointer"} activation without dragging`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: touch });
    const page = await context.newPage();
    try {
      await page.goto(test.info().project.use.baseURL + "/en/");
      const item = page.locator("#profile");
      const activate = (button: Locator) => touch ? button.tap() : button.click();
      await activate(item.getByRole("button", { name: "Move: My profile", exact: true }));
      for (const [direction, dx, dy] of [["up", 0, -24], ["down", 0, 24], ["left", -24, 0], ["right", 24, 0]] as const) {
        const before = await position(item);
        await activate(item.getByRole("button", { name: `Move ${direction}: My profile`, exact: true }));
        expect(await position(item)).toEqual({ x: before.x + dx, y: before.y + dy });
        await expect(item).not.toHaveClass(/is-dragging/);
      }
    } finally { await context.close(); }
  });
}

test("button movement shares drag clamping, stays reachable and resets without storage", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/en/");
  const item = page.locator("#profile");
  const toggle = item.getByRole("button", { name: "Move: My profile", exact: true });
  const storage = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const original = await position(item), saved = await storage();
  await tabTo(page, toggle);
  await page.keyboard.press("Enter");
  for (const direction of ["up", "down", "left", "right"]) {
    const button = item.getByRole("button", { name: `Move ${direction}: My profile`, exact: true });
    await tabTo(page, button);
    const bound = await item.evaluate((node: HTMLElement) => ({ x: node.parentElement!.clientWidth - node.offsetWidth, y: node.parentElement!.clientHeight - node.offsetHeight }));
    // More real keyboard activations than needed to hit and exceed either edge.
    for (let i = 0; i < Math.ceil(Math.max(bound.x, bound.y) / 24) + 2; i++) await page.keyboard.press("Enter");
    const point = await position(item);
    if (direction === "up") expect(point.y).toBe(0);
    if (direction === "left") expect(point.x).toBe(0);
    if (direction === "down") expect(point.y).toBe(bound.y);
    if (direction === "right") expect(point.x).toBe(bound.x);
    await expect(button).toBeInViewport();
    await expect(button).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(item.locator(".window-close")).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(await storage()).toEqual(saved);
  await page.reload();
  await expect.poll(() => position(item)).toEqual(original);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(await storage()).toEqual(saved);
});

test("compact layout hides movement, restores focus and keeps positions through mode changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/");
  const item = page.locator("#profile");
  const toggle = item.getByRole("button", { name: "Move: My profile", exact: true });
  await tabTo(page, toggle);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  const moved = await position(item);
  for (const width of [640, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(item).toHaveCSS("position", "relative");
    await expect(page.locator(".window-move:visible, .window-directions:visible")).toHaveCount(0);
    await expect(item.locator(".window-close")).toBeFocused();
    await expect(item.locator(".window-move")).toHaveAttribute("aria-expanded", "false");
    const before = await position(item);
    const bar = (await item.locator(".window-titlebar").boundingBox())!;
    await page.mouse.move(bar.x + 20, bar.y + 20);
    await page.mouse.down();
    await page.mouse.move(bar.x + 60, bar.y + 60);
    await page.mouse.up();
    expect(await position(item)).toEqual(before);
    await expect(item).not.toHaveClass(/is-dragging/);
    // A stale switch activation queued across resize must also be harmless.
    await item.getByRole("button", { name: "Move right: My profile", includeHidden: true }).dispatchEvent("click");
    expect(await position(item)).toEqual(before);
    await item.locator(".window-close").focus();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(toggle).toBeVisible();
  await expect.poll(() => position(item)).toEqual(moved);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
