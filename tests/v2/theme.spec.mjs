import { expect, test } from "@playwright/test";
import { calculateSolarTimes } from "../../v2/src/theme/solar.ts";
import { applyPagesCsp } from "../support/csp-enforcement.mjs";

const storageKey = "huihui-v2-theme";
const daytime = new Date("2026-09-12T12:00:00+08:00");
const nighttime = new Date("2026-09-12T23:00:00+08:00");
const locales = [
  { route: "/", lang: "zh-Hant", theme: "主題", auto: "自動", light: "淺色", dark: "深色" },
  { route: "/en/", lang: "en", theme: "Theme", auto: "Auto", light: "Light", dark: "Dark" },
  { route: "/ja/", lang: "ja", theme: "テーマ", auto: "自動", light: "ライト", dark: "ダーク" },
];

test.use({ timezoneId: "Asia/Taipei" });

test.beforeEach(async ({ page, baseURL }) => {
  await applyPagesCsp(page, baseURL);
});

function control(page) {
  const root = page.locator(".theme-switcher");
  return { root, trigger: root.locator(".theme-trigger"), menu: root.getByRole("menu") };
}

async function expectEffective(page, effective) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", effective);
  await expect(page.locator(".theme-icon")).toHaveText(effective === "light" ? "☀︎" : "☾");
  expect(await page.locator("html").evaluate((node) => getComputedStyle(node).colorScheme)).toBe(effective);
}

async function choose(page, label) {
  const { root, trigger } = control(page);
  await trigger.click();
  await root.getByRole("menuitemradio", { name: label, exact: true }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

async function expectPreference(page, selected, labels = ["Auto", "Light", "Dark"]) {
  const { root, trigger } = control(page);
  await trigger.click();
  for (const label of labels) {
    const item = root.getByRole("menuitemradio", { name: label, exact: true });
    await expect(item).toHaveAttribute("aria-checked", label === selected ? "true" : "false");
    await expect(item.locator(".theme-selected")).toHaveText(label === selected ? "✓" : "");
    await expect(item.locator(".theme-selected")).toHaveAttribute("aria-hidden", "true");
  }
  await expect(root.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
}

for (const locale of locales) {
  for (const width of [1440, 390]) {
    test(`${locale.lang} theme menu at ${width}px uses localized modes and effective icons`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(daytime);
      await page.goto(locale.route);
      expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("Asia/Taipei");
      await expectEffective(page, "light");
      const { root, trigger, menu } = control(page);
      await expect(trigger).toHaveAccessibleName(`${locale.theme}: ${locale.light}`);
      await expect(trigger).toHaveText("☀︎");
      await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expectPreference(page, locale.auto, [locale.auto, locale.light, locale.dark]);
      const headerBefore = await page.getByRole("banner").boundingBox();
      await trigger.click();
      await expect(menu).toHaveAccessibleName(locale.theme);
      await expect(root.getByRole("menuitemradio")).toHaveCount(3);
      const box = await menu.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.getByRole("banner").boundingBox()).toEqual(headerBefore);
      for (const item of await root.getByRole("menuitemradio").all()) {
        await expect(item).toBeInViewport();
        expect(await item.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        })).toBe(true);
      }
      if (testInfo.project.name === "chromium" && locale.lang === "en" && width === 390) {
        await page.screenshot({ path: testInfo.outputPath("mobile-light-theme-menu.png"), fullPage: true });
      }
      await root.getByRole("menuitemradio", { name: locale.dark, exact: true }).click();
      await expectEffective(page, "dark");
      await expect(trigger).toHaveAccessibleName(`${locale.theme}: ${locale.dark}`);
      await expectPreference(page, locale.dark, [locale.auto, locale.light, locale.dark]);
      if (testInfo.project.name === "chromium" && locale.lang === "en" && width === 1440) {
        await trigger.click();
        await page.screenshot({ path: testInfo.outputPath("desktop-dark-theme-menu.png"), fullPage: true });
        await page.keyboard.press("Escape");
      }
      await choose(page, locale.auto);
      await expectEffective(page, "light");
      await expectPreference(page, locale.auto, [locale.auto, locale.light, locale.dark]);

      // The two adjacent controls close each other without changing language.
      const language = page.locator(".language-switcher");
      await trigger.click();
      await language.locator("summary").click();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(language).toHaveAttribute("open", "");
      await trigger.click();
      await expect(language).not.toHaveAttribute("open");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("heading", { level: 1 }).click();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

for (const width of [1440, 390]) {
  test(`theme menu has keyboard reachability, selection and dismissal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(daytime);
    await page.goto("/en/");
    const { root, trigger } = control(page);
    // Reach the new control through document Tab order, after the language summary.
    for (let index = 0; index < 6; index++) await page.keyboard.press("Tab");
    await expect(page.locator(".language-switcher summary")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    expect(await trigger.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(root.getByRole("menuitemradio", { name: "Auto", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(root.getByRole("menuitemradio", { name: "Light", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    const dark = root.getByRole("menuitemradio", { name: "Dark", exact: true });
    await expect(dark).toBeFocused();
    expect(await dark.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
    await page.keyboard.press("Space");
    await expectEffective(page, "dark");
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Space");
    await expect(dark).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(root.getByRole("menuitemradio", { name: "Auto", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(dark).toBeFocused();
    await page.keyboard.press("Home");
    await expect(root.getByRole("menuitemradio", { name: "Auto", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(dark).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".language-switcher summary")).toBeFocused();
  });
}

test("explicit modes survive reload while Auto always persists as auto", async ({ page }) => {
  await page.clock.setFixedTime(daytime);
  await page.goto("/en/");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  await expectPreference(page, "Auto");
  for (const [mode, effective] of [["Dark", "dark"], ["Light", "light"]]) {
    await choose(page, mode);
    await expectEffective(page, effective);
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(effective);
    await page.reload();
    await expectEffective(page, effective);
    await expectPreference(page, mode);
  }
  await page.clock.setFixedTime(nighttime);
  await page.reload();
  await expectEffective(page, "light");
  await choose(page, "Auto");
  await expectEffective(page, "dark");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("auto");
  await page.reload();
  await expectEffective(page, "dark");
  await expectPreference(page, "Auto");
  await page.clock.setFixedTime(daytime);
  await page.reload();
  await expectEffective(page, "light");
  await expectPreference(page, "Auto");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("auto");
});

test("saved Auto uses the device timezone again in the next session", async ({ page, context, browser, baseURL }) => {
  await page.clock.setFixedTime(daytime);
  await page.goto("/en/");
  await choose(page, "Auto");
  await expectEffective(page, "light");
  const nextSession = await browser.newContext({
    timezoneId: "America/New_York",
    storageState: await context.storageState(),
  });
  try {
    const nextPage = await nextSession.newPage();
    await nextPage.clock.setFixedTime(daytime);
    await applyPagesCsp(nextPage, baseURL);
    await nextPage.goto(`${baseURL}/en/`);
    expect(await nextPage.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("America/New_York");
    await expectEffective(nextPage, "dark");
    await expectPreference(nextPage, "Auto");
    expect(await nextPage.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("auto");
  } finally {
    await nextSession.close();
  }
});

test("Auto switches at today's sunrise and sunset while the page stays open", async ({ page }) => {
  // IANA's Taipei representative point. Unit coverage independently checks solar
  // accuracy; this test checks integration at the calculator's exact boundaries.
  const solar = calculateSolarTimes({ year: 2026, month: 9, day: 12 }, { latitude: 25.05, longitude: 121.5 });
  expect(solar.kind).toBe("normal");
  await page.clock.install({ time: new Date(solar.sunrise - 10_000) });
  await page.clock.pauseAt(new Date(solar.sunrise - 1));
  await page.goto("/en/");
  await expectEffective(page, "dark");
  await page.clock.runFor(1);
  await expectEffective(page, "light");
  await expectPreference(page, "Auto");
  await page.clock.fastForward(solar.sunset - solar.sunrise - 1);
  await expectEffective(page, "light");
  await page.clock.runFor(1);
  await expectEffective(page, "dark");
  await expectPreference(page, "Auto");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});

test("Auto reevaluates after a clock jump when the page becomes active", async ({ page }) => {
  await page.clock.install({ time: daytime });
  await page.goto("/en/");
  await expectEffective(page, "light");
  // setSystemTime does not fire timers, so the reactivation event must recalculate.
  await page.clock.setSystemTime(nighttime);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expectEffective(page, "dark");
  await page.clock.setSystemTime(daytime);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expectEffective(page, "light");
  await expectPreference(page, "Auto");
});

test("unsupported timezone and denied storage keep rendering and manual choices working", async ({ page }) => {
  await page.addInitScript(() => {
    const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function () {
      return { ...resolvedOptions.call(this), timeZone: "Unsupported/Timezone" };
    };
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage denied", "SecurityError"); } });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/en/");
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("Unsupported/Timezone");
  await expect(page.getByRole("main")).toBeVisible();
  await expectEffective(page, "light");
  await expectPreference(page, "Auto");
  await choose(page, "Dark");
  await expectEffective(page, "dark");
  await expectPreference(page, "Dark");
  await choose(page, "Auto");
  await expectEffective(page, "light");
  expect(errors).toEqual([]);
});

for (const saved of [null, "dark"]) {
  test(`first app content has dark tokens under enforcing CSP (${saved ?? "unsaved Auto"})`, async ({ page, baseURL }) => {
    await page.clock.setFixedTime(saved ? daytime : nighttime);
    await page.addInitScript(({ key, preference }) => {
      if (preference) localStorage.setItem(key, preference);
      window.themeObservations = { firstContent: null, geolocationReads: 0, violations: [] };
      Object.defineProperty(navigator, "geolocation", {
        get() {
          window.themeObservations.geolocationReads++;
          throw new Error("Theme must not request geolocation");
        },
      });
      document.addEventListener("securitypolicyviolation", (event) => {
        window.themeObservations.violations.push({ directive: event.effectiveDirective, disposition: event.disposition });
      });
      const observer = new MutationObserver(() => {
        if (!document.querySelector("#app > *")) return;
        window.themeObservations.firstContent = {
          theme: document.documentElement.dataset.theme,
          colorScheme: getComputedStyle(document.documentElement).colorScheme,
        };
        observer.disconnect();
      });
      observer.observe(document, { subtree: true, childList: true });
    }, { key: storageKey, preference: saved });
    const serviceRequests = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== new URL(baseURL).origin
          || ["fetch", "xhr", "websocket", "eventsource"].includes(request.resourceType())) {
        serviceRequests.push(request.url());
      }
    });
    let releaseMain;
    const mainGate = new Promise((resolve) => { releaseMain = resolve; });
    const mainRequested = page.waitForRequest((request) => /\/assets\/main-[^/]+\.js$/.test(new URL(request.url()).pathname));
    await page.route(/\/assets\/main-[^/]+\.js$/, async (route) => {
      await mainGate;
      await route.continue();
    });
    const navigation = page.goto("/en/");
    try {
      await mainRequested;
      // The classic external bootstrap must resolve Auto/saved Dark before the
      // application module arrives, even with its request deliberately held.
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
      await expect(page.locator("html")).toHaveCSS("background-color", "rgb(21, 26, 23)");
      await expect(page.locator("#app > *")).toHaveCount(0);
    } finally {
      releaseMain();
      await navigation;
    }
    await expectEffective(page, "dark");
    await expectPreference(page, saved ? "Dark" : "Auto");
    await choose(page, "Light");
    await choose(page, "Auto");
    const observations = await page.evaluate(() => window.themeObservations);
    expect(observations.firstContent).toEqual({ theme: "dark", colorScheme: "dark" });
    expect(observations.geolocationReads).toBe(0);
    expect(observations.violations).toEqual([]);
    expect(serviceRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("theme menu reflows with enlarged text and forced colors", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.clock.setFixedTime(daytime);
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/ja/");
  await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
  const { root, trigger, menu } = control(page);
  await trigger.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await menu.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  for (const option of await root.getByRole("menuitemradio").all()) await expect(option).toBeInViewport();
  await expect(root.getByRole("menuitemradio", { name: "自動", exact: true })).toHaveAttribute("aria-checked", "true");
});
