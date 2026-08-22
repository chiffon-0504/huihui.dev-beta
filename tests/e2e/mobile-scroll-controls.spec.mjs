import { expect, test } from "@playwright/test";

const mobileViewport = { width: 390, height: 844 };
const inactivityDelay = 3200;

async function loadPage(page, route = "/about/") {
  await page.setViewportSize(mobileViewport);
  const response = await page.goto(route, { waitUntil: "load" });

  expect(response?.status()).toBe(200);
  return page.locator(".scroll-controls");
}

async function getScrollPosition(page) {
  return page.evaluate(() => ({
    maxScrollTop:
      document.scrollingElement.scrollHeight -
      document.scrollingElement.clientHeight,
    scrollingElement: document.scrollingElement?.tagName,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }));
}

test("mobile skip link is pointer-hidden and keyboard-visible with native hash navigation", async ({
  page,
}) => {
  await loadPage(page, "/en/about/");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  const main = page.locator("#main-content");

  expect(
    await skipLink.evaluate((element) => element.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(0);

  await main.click({ position: { x: 20, y: 100 } });
  await expect(skipLink).not.toBeFocused();
  expect(
    await skipLink.evaluate((element) => element.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(0);

  await page.reload({ waitUntil: "load" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  const focusedState = await skipLink.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      top: rect.top,
    };
  });
  expect(focusedState.top).toBeGreaterThanOrEqual(12);
  expect(focusedState.outlineStyle).not.toBe("none");
  expect(focusedState.outlineWidth).not.toBe("0px");

  await page.keyboard.press("Enter");
  await expect(main).toBeFocused();
  expect(new URL(page.url()).hash).toBe("#main-content");
  expect((await getScrollPosition(page)).scrollY).toBe(0);
});

test("scroll controls use localized native buttons and remain mobile-only", async ({
  page,
}) => {
  const locales = [
    { route: "/", top: "回到頂端", bottom: "前往底部" },
    { route: "/en/", top: "Scroll to top", bottom: "Scroll to bottom" },
    {
      route: "/ja/",
      top: "ページ上部へ移動",
      bottom: "ページ下部へ移動",
    },
  ];

  for (const locale of locales) {
    const controls = await loadPage(page, locale.route);
    const topButton = page.getByRole("button", { name: locale.top });
    const bottomButton = page.getByRole("button", { name: locale.bottom });

    await expect(controls).toHaveCSS("opacity", "0");
    await expect(topButton).toHaveAttribute("type", "button");
    await expect(bottomButton).toHaveAttribute("type", "button");
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/en/");
  await expect(page.locator(".scroll-controls")).toHaveCSS("display", "none");
});

test("scrolling shows controls and inactivity hides them unless focus is retained", async ({
  page,
}) => {
  const controls = await loadPage(page);
  const topButton = page.getByRole("button", { name: "回到頂端" });
  const main = page.locator("#main-content");

  await expect(controls).toHaveCSS("opacity", "0");
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await expect(controls).toHaveClass(/\bis-visible\b/);
  await expect(controls).toHaveCSS("opacity", "1");

  await page.waitForTimeout(inactivityDelay);
  await expect(controls).not.toHaveClass(/\bis-visible\b/);
  await expect(controls).toHaveCSS("opacity", "0");

  await topButton.focus();
  await expect(topButton).toBeFocused();
  await expect(controls).toHaveCSS("opacity", "1");
  await page.waitForTimeout(inactivityDelay);
  await expect(controls).toHaveCSS("opacity", "1");

  await main.focus();
  await page.waitForTimeout(inactivityDelay);
  await expect(controls).toHaveCSS("opacity", "0");
});

test("active pointer interaction postpones the inactivity timeout", async ({
  page,
}) => {
  const controls = await loadPage(page);
  const bottomButton = page.getByRole("button", { name: "前往底部" });

  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await expect(controls).toHaveCSS("opacity", "1");
  await bottomButton.dispatchEvent("pointerdown", { pointerId: 7 });
  await page.waitForTimeout(inactivityDelay);
  await expect(controls).toHaveCSS("opacity", "1");

  await page.evaluate(() =>
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7 })),
  );
  await page.waitForTimeout(inactivityDelay);
  await expect(controls).toHaveCSS("opacity", "0");
});

test("Top and Bottom scroll the native document without URL or overflow changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeScrollTo = window.scrollTo.bind(window);
    window.__scrollControlCalls = [];
    window.scrollTo = (...args) => {
      window.__scrollControlCalls.push(args[0]);
      return nativeScrollTo(...args);
    };
  });
  const controls = await loadPage(page);
  const topButton = page.getByRole("button", { name: "回到頂端" });
  const bottomButton = page.getByRole("button", { name: "前往底部" });
  const initialUrl = page.url();

  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "instant" }));
  await expect(controls).toHaveCSS("opacity", "1");
  await bottomButton.click();
  await expect
    .poll(() => getScrollPosition(page))
    .toMatchObject({ scrollingElement: "HTML", scrollX: 0 });
  await expect
    .poll(async () => {
      const { maxScrollTop, scrollY } = await getScrollPosition(page);
      return Math.abs(maxScrollTop - scrollY);
    })
    .toBeLessThanOrEqual(1);
  await expect(bottomButton).toBeFocused();
  expect(page.url()).toBe(initialUrl);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);

  await topButton.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(topButton).toBeFocused();
  expect(page.url()).toBe(initialUrl);
  expect(
    await page.evaluate(() => window.__scrollControlCalls.at(-1)?.behavior),
  ).toBe("smooth");
});

test("reduced motion keeps controls functional without fade or smooth scrolling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const nativeScrollTo = window.scrollTo.bind(window);
    window.__scrollControlCalls = [];
    window.scrollTo = (...args) => {
      window.__scrollControlCalls.push(args[0]);
      return nativeScrollTo(...args);
    };
  });
  const controls = await loadPage(page, "/ja/about/");
  const bottomButton = page.getByRole("button", {
    name: "ページ下部へ移動",
  });
  const topButton = page.getByRole("button", { name: "ページ上部へ移動" });

  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "instant" }));
  await expect(controls).toHaveCSS("transition-duration", "0s");
  await bottomButton.click();
  expect(
    await page.evaluate(() => window.__scrollControlCalls.at(-1)?.behavior),
  ).toBe("auto");
  const bottomState = await getScrollPosition(page);
  expect(Math.abs(bottomState.maxScrollTop - bottomState.scrollY)).toBeLessThanOrEqual(
    1,
  );

  await topButton.click();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    await page.evaluate(() => window.__scrollControlCalls.at(-1)?.behavior),
  ).toBe("auto");
});
