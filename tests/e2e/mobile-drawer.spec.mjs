import { expect, test } from "@playwright/test";

const mobileViewport = { width: 390, height: 844 };
const drawerFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]",
].join(",");

async function loadMobilePage(page, route = "/") {
  await page.setViewportSize(mobileViewport);
  const response = await page.goto(route, { waitUntil: "load" });
  const toggle = page.locator("#menuToggle");
  const sidebar = page.locator("#site-sidebar");

  expect(response?.status()).toBe(200);
  await expect(toggle).toBeVisible();

  return { sidebar, toggle };
}

test("keyboard opening moves focus into the drawer and blocks the background", async ({
  page,
}) => {
  const { sidebar, toggle } = await loadMobilePage(page);

  await expect(toggle).toHaveAttribute("aria-controls", "site-sidebar");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await page.keyboard.press("Enter");

  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar).toHaveClass(/\bopen\b/);
  await expect(sidebar).not.toHaveAttribute("aria-hidden");
  await expect(sidebar.locator(drawerFocusableSelector).first()).toBeFocused();
  expect(await page.locator("main.main").evaluate((element) => element.inert)).toBe(
    true,
  );
});

test("opening retries initial focus once when the browser rejects the first attempt", async ({
  page,
}) => {
  const { sidebar, toggle } = await loadMobilePage(page);
  const firstDrawerControl = sidebar.locator(drawerFocusableSelector).first();

  await firstDrawerControl.evaluate((element) => {
    const nativeFocus = element.focus.bind(element);
    let focusAttempts = 0;

    element.focus = (...args) => {
      focusAttempts += 1;
      if (focusAttempts > 1) nativeFocus(...args);
    };
    window.__drawerFocusAttempts = () => focusAttempts;
  });

  await toggle.focus();
  await page.keyboard.press("Enter");

  await expect(firstDrawerControl).toBeFocused();
  expect(await page.evaluate(() => window.__drawerFocusAttempts())).toBe(2);
});

test("Escape closes the drawer and restores focus to the menu button", async ({
  page,
}) => {
  const { sidebar, toggle } = await loadMobilePage(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(sidebar).not.toHaveClass(/\bopen\b/);
  await expect(toggle).toBeFocused();
  expect(await page.locator("main.main").evaluate((element) => element.inert)).toBe(
    false,
  );
});

test("Tab and Shift+Tab keep focus contained in the open drawer", async ({
  page,
}) => {
  const { sidebar, toggle } = await loadMobilePage(page);
  const focusable = sidebar.locator(drawerFocusableSelector);
  const firstFocusable = focusable.first();
  const lastFocusable = focusable.last();

  await toggle.click();
  await expect(firstFocusable).toBeFocused();

  await lastFocusable.focus();
  await page.keyboard.press("Tab");
  await expect(firstFocusable).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(lastFocusable).toBeFocused();
});

test("the closed mobile drawer is outside the keyboard tab order", async ({
  page,
}) => {
  const { sidebar, toggle } = await loadMobilePage(page);
  const firstDrawerLink = sidebar.locator("a").first();

  expect(await sidebar.evaluate((element) => element.inert)).toBe(true);
  await expect(sidebar).toHaveAttribute("aria-hidden", "true");
  await firstDrawerLink.evaluate((element) => element.focus());
  await expect(firstDrawerLink).not.toBeFocused();

  await toggle.focus();
  await page.keyboard.press("Tab");
  expect(
    await sidebar.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(false);
});

test("fallback inert handles Tier Maker links injected after drawer initialization", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete HTMLElement.prototype.inert;
  });

  const { sidebar, toggle } = await loadMobilePage(page, "/tools/tier-maker/");
  const drawerLinks = sidebar.locator("a");

  expect(await sidebar.evaluate((element) => "inert" in element)).toBe(false);
  expect(await drawerLinks.count()).toBeGreaterThan(0);
  expect(
    await drawerLinks.evaluateAll((links) =>
      links.every((link) => link.getAttribute("tabindex") === "-1"),
    ),
  ).toBe(true);

  await toggle.click();
  await expect(drawerLinks.first()).not.toHaveAttribute("tabindex");

  await page.keyboard.press("Escape");
  await expect(drawerLinks.first()).toHaveAttribute("tabindex", "-1");
});

const localizedLabels = [
  {
    route: "/",
    open: "開啟導覽選單",
    close: "關閉導覽選單",
  },
  {
    route: "/en/",
    open: "Open navigation",
    close: "Close navigation",
  },
  {
    route: "/ja/",
    open: "ナビゲーションを開く",
    close: "ナビゲーションを閉じる",
  },
];

for (const labels of localizedLabels) {
  test(`${labels.route} keeps localized open and close labels synchronized`, async ({
    page,
  }) => {
    const { toggle } = await loadMobilePage(page, labels.route);

    await expect(toggle).toHaveAttribute("aria-label", labels.open);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", labels.close);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-label", labels.open);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
}

test("desktop sidebar links remain focusable and the menu control stays hidden", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto("/", { waitUntil: "load" });
  const sidebar = page.locator("#site-sidebar");
  const firstLink = sidebar.locator("a").first();

  expect(response?.status()).toBe(200);
  await expect(page.locator("#menuToggle")).toBeHidden();
  expect(await sidebar.evaluate((element) => element.inert)).toBe(false);
  await firstLink.focus();
  await expect(firstLink).toBeFocused();
});
