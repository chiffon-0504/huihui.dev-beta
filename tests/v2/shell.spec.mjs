import { expect, test } from "@playwright/test";
import { applyPagesCsp } from "../support/csp-enforcement.mjs";

const locales = [
  { route: "/", lang: "zh-Hant", skip: "跳至主要內容", navigation: "主要導覽", worksLabel: "作品", aboutLabel: "關於", postsLabel: "文章", worksHeading: "精選作品", focusLabel: "從設計到開發" },
  { route: "/en/", lang: "en", skip: "Skip to main content", navigation: "Main navigation", worksLabel: "Works", aboutLabel: "About", postsLabel: "Posts", worksHeading: "Selected work", focusLabel: "From design to development" },
  { route: "/ja/", lang: "ja", skip: "メインコンテンツへ移動", navigation: "メインナビゲーション", worksLabel: "制作実績", aboutLabel: "プロフィール", postsLabel: "記事", worksHeading: "ピックアップした作品", focusLabel: "デザインから開発まで" },
];

for (const locale of locales) {
  test(`${locale.lang} shares localized navigation and section labels`, async ({ page }) => {
    await page.goto(locale.route);
    const nav = page.getByRole("navigation", { name: locale.navigation });
    for (const [id, label] of [["works", locale.worksLabel], ["about", locale.aboutLabel]]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", `${locale.route}${id}/`);
      await expect(page.locator(`#${id}`).getByRole("heading", { level: 2, name: id === "works" ? locale.worksHeading : locale.focusLabel, exact: true })).toBeVisible();
    }
    if (locale.lang !== "en") {
      await expect(nav.getByRole("link", { name: /^(Works|About)$/ })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /^(Works|About)$/ })).toHaveCount(0);
    }
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`${locale.lang} shell and keyboard at ${viewport.width}px`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize(viewport);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await applyPagesCsp(page, baseURL);
      await page.goto(locale.route);

      await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toBeVisible();
      const nav = page.getByRole("navigation", { name: locale.navigation });
      await expect(nav.getByRole("link")).toHaveCount(viewport.width > 768 ? 5 : 1);
      await expect(nav.getByRole("link", { name: "huihui.dev", exact: true })).toHaveAttribute("href", locale.route);
      if (viewport.width > 768) {
        await expect(nav.getByRole("link", { name: locale.worksLabel, exact: true })).toHaveAttribute("href", `${locale.route}works/`);
        await expect(nav.getByRole("link", { name: locale.aboutLabel, exact: true })).toHaveAttribute("href", `${locale.route}about/`);
        await expect(nav.getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", "https://github.com/chiffon-0504");
      }
      await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("hreflang", locale.lang);
      await expect(page.getByRole("contentinfo").getByRole("link")).toHaveAttribute("href", "mailto:contact@huihui.dev");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (testInfo.project.name === "chromium") {
        await page.screenshot({ path: testInfo.outputPath(`${locale.lang}-${viewport.width}.png`), fullPage: true });
      }

      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: locale.skip });
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main")).toBeFocused();

      // Restart without a fragment so tab order begins at the document start.
      await page.goto(locale.route);
      await page.keyboard.press("Tab");
      for (const [navIndex, label] of (viewport.width > 768 ? ["huihui.dev", locale.worksLabel, locale.aboutLabel, locale.postsLabel, "GitHub"] : ["huihui.dev"]).entries()) {
        await page.keyboard.press("Tab");
        const current = nav.getByRole("link", { name: label, exact: true });
        await expect(current).toBeFocused();
        await expect(current).toBeInViewport();
        expect(await current.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
        const sectionId = navIndex === 1 ? "works" : navIndex === 2 ? "about" : navIndex === 3 ? "posts" : null;
        if (sectionId) {
          await page.keyboard.press("Enter");
          if (sectionId === "posts") {
            await expect(page).toHaveURL(new RegExp(`${locale.route}posts/$`));
            await expect(page.locator("main.posts")).toBeVisible();
          } else if (sectionId === "about") {
            await expect(page).toHaveURL(new RegExp(`${locale.route}about/$`));
            await expect(page.locator("main.about")).toBeVisible();
          } else {
            await expect(page).toHaveURL(new RegExp(`${locale.route}works/$`));
            await expect(page.locator("main.works")).toBeVisible();
          }
          // Reload instead of relying on engine-specific fragment tab order.
          await page.goto(locale.route);
          for (let index = 0; index < navIndex + 2; index++) {
            await page.keyboard.press("Tab");
          }
          await expect(current).toBeFocused();
        }
      }
      await page.keyboard.press("Tab");
      await expect(nav.locator("summary")).toBeFocused();
      await page.keyboard.press("Enter");
      for (const label of ["繁體中文", "English", "日本語"]) {
        await page.keyboard.press("Tab");
        await expect(nav.getByRole("link", { name: label, exact: true })).toBeFocused();
      }
      await page.keyboard.press("Enter");
      await expect(page.locator("html")).toHaveAttribute("lang", "ja");
      expect(errors).toEqual([]);
    });
  }

  test(`${locale.lang} reflows at 320px with enlarged text and reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(locale.route);
    await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator(".navbar-toggle").click();
    for (const link of await page.locator(".nav-drawer").getByRole("link").all()) {
      await expect(link).toBeVisible();
    }
  });
}

const drawerLabels = {
  "zh-Hant": ["開啟導覽選單", "關閉導覽選單", "淺色", "深色"],
  en: ["Open navigation", "Close navigation", "Light", "Dark"],
  ja: ["ナビゲーションを開く", "ナビゲーションを閉じる", "ライト", "ダーク"],
};

async function expectTextFocus(control, theme) {
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS("outline-style", "none");
  await expect(control).toHaveCSS("border-radius", "0px");
  await expect(control).toHaveCSS("box-shadow", "none");
  await expect(control).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(control).toHaveCSS("text-decoration-line", "underline");
  await expect(control).toHaveCSS("color", theme === "light" ? "rgb(0, 111, 222)" : "rgb(143, 211, 255)");
}

for (const locale of locales) {
  for (const theme of ["light", "dark"]) {
    test(`${locale.lang} mobile drawer keyboard, dismissal and links in ${theme}`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await applyPagesCsp(page, baseURL);
      await page.goto(locale.route);
      const [openLabel, closeLabel, light, dark] = drawerLabels[locale.lang];
      await page.locator(".theme-trigger").click();
      await page.getByRole("menuitemradio", { name: theme === "light" ? light : dark, exact: true }).click();
      const toggle = page.getByRole("button", { name: openLabel, exact: true });
      const drawer = page.getByRole("dialog", { name: locale.navigation });
      const close = drawer.getByRole("button", { name: closeLabel, exact: true });
      await expect(toggle).toHaveAttribute("aria-controls", "nav-drawer");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(".navbar-primary")).toBeHidden();
      const bars = await toggle.locator(".hamburger span").evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, y: rect.y };
      }));
      expect(bars).toHaveLength(3);
      expect(bars.every((bar) => bar.width === bars[0].width && bar.height === 2)).toBe(true);
      expect(bars[1].y - bars[0].y).toBe(bars[2].y - bars[1].y);

      // Reach and activate the trigger using native keyboard order.
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("Enter");
      await expectTextFocus(close, theme);
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(drawer.getByRole("navigation")).toHaveAccessibleName(locale.navigation);
      await expect(drawer.getByRole("link")).toHaveText([locale.worksLabel, locale.aboutLabel, locale.postsLabel, "GitHub"]);
      const hrefs = [`${locale.route}works/`, `${locale.route}about/`, `${locale.route}posts/`, "https://github.com/chiffon-0504"];
      for (const [index, anchor] of (await drawer.getByRole("link").all()).entries()) {
        await expect(anchor).toHaveAttribute("href", hrefs[index]);
        await page.keyboard.press("Tab");
        await expectTextFocus(anchor, theme);
      }
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(drawer.getByRole("link").last()).toBeFocused();
      const box = await drawer.boundingBox();
      expect(box.x).toBe(0);
      expect(box.y).toBe(0);
      expect(box.width).toBe(page.viewportSize().width);
      // WebKit CI resolves 100dvh to 843.984375px at an 844px viewport.
      expect(Math.abs(box.height - page.viewportSize().height)).toBeLessThanOrEqual(1 / 64);
      const closeBox = await close.boundingBox();
      expect(closeBox.x).toBeGreaterThan(box.width / 2);
      expect(closeBox.y).toBeLessThan(32);
      await expect(drawer).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(10, 10, 10)");
      const scrollY = await page.evaluate(() => scrollY);
      await page.mouse.move(380, 600);
      await page.mouse.wheel(0, 400);
      await expect(page.locator("html")).toHaveCSS("overflow-y", "hidden");
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
      if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath(`drawer-${locale.lang}-${theme}.png`) });

      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("html")).not.toHaveCSS("overflow-y", "hidden");
      await page.mouse.wheel(0, 300);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollY);
      await toggle.click();
      await close.click();
      await expect(drawer).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
      // The full-screen surface covers the former backdrop area as well.
      await page.mouse.click(100, 400);
      await expect(drawer).toBeVisible();
      await page.mouse.click(380, 400);
      await expect(drawer).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(toggle).toBeFocused();

      for (const href of hrefs.slice(0, 3)) {
        await page.locator(".navbar-toggle").click();
        await page.locator(`.nav-drawer a[href='${href}']`).click();
        await expect(page).toHaveURL(new URL(href, baseURL).href);
        await page.locator(".navbar-toggle").click();
        await expect(page.locator(".drawer-links a[aria-current=page]")).toHaveAttribute("href", href);
        await page.keyboard.press("Escape");
      }
    });

    test(`${locale.lang} full-screen drawer surface and focus in ${theme}`, async ({ page }, testInfo) => {
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(locale.route);
        const [, , light, dark] = drawerLabels[locale.lang];
        await page.locator(".theme-trigger").click();
        await page.getByRole("menuitemradio", { name: theme === "light" ? light : dark, exact: true }).click();
        await page.locator(".navbar-toggle").click();
        const drawer = page.locator(".nav-drawer");
        const close = drawer.locator(".drawer-close");
        const box = await drawer.boundingBox();
        expect(box.x).toBe(0);
        expect(box.y).toBe(0);
        expect(box.width).toBe(width);
        expect(Math.abs(box.height - 844)).toBeLessThanOrEqual(1 / 64);
        await expect(drawer).toHaveCSS("max-width", "none");
        await expect(drawer).toHaveCSS("margin", "0px");
        await expect(drawer).toHaveCSS("inset", "0px");
        await expect(drawer).toHaveCSS("border-radius", "0px");
        await expect(drawer).toHaveCSS("border-width", "0px");
        await expect(drawer).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(10, 10, 10)");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.elementFromPoint(innerWidth - 1, innerHeight / 2)?.closest("dialog")?.id)).toBe("nav-drawer");
        const closeBox = await close.boundingBox();
        expect(width - closeBox.x - closeBox.width).toBe(16);
        expect(closeBox.y).toBe(16);
        await expect(close).toBeFocused();
        await expect(close).toHaveCSS("text-decoration-line", "none");
        for (const control of await drawer.locator(".button").all()) {
          await expect(control).toHaveCSS("border-width", "0px");
          await expect(control).toHaveCSS("border-radius", "0px");
          await expect(control).toHaveCSS("outline-style", "none");
          await expect(control).toHaveCSS("box-shadow", "none");
          await expect(control).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        }
        const links = drawer.getByRole("link");
        for (const anchor of await links.all()) {
          await expect(anchor).toHaveCSS("font-size", "18px");
          await expect(anchor).toHaveCSS("font-weight", "600");
          const textLines = await anchor.evaluate((node) => {
            const text = [...node.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
            const range = document.createRange();
            range.selectNodeContents(text);
            return range.getClientRects().length;
          });
          expect(textLines).toBe(1);
        }
        const github = links.last();
        const githubBox = await github.boundingBox();
        const iconBox = await github.locator("svg").boundingBox();
        expect(Math.abs(iconBox.y + iconBox.height / 2 - githubBox.y - githubBox.height / 2)).toBeLessThanOrEqual(1 / 64);
        const rows = await links.evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y, bottom: rect.bottom };
        }));
        expect(rows.every((row) => row.x === 16)).toBe(true);
        for (let index = 1; index < rows.length; index++) expect(rows[index].y - rows[index - 1].bottom).toBeGreaterThanOrEqual(24);
        await expect(links.last().locator("svg")).toBeVisible();
        await page.keyboard.press("Tab");
        await expectTextFocus(links.first(), theme);
        if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath(`fullscreen-${locale.lang}-${width}-${theme}.png`) });
        await page.keyboard.press("Shift+Tab");
        await expectTextFocus(close, theme);
        if (testInfo.project.name === "chromium" && width === 390) await page.screenshot({ path: testInfo.outputPath(`close-${locale.lang}-${theme}.png`) });
        await close.click();
        await expect(drawer).toBeHidden();
        await expect(page.locator(".navbar-toggle")).toBeFocused();
      }
    });
  }

  test(`${locale.lang} navigation breakpoint, resize cleanup and enlarged text`, async ({ page }) => {
    await page.goto(locale.route);
    for (const width of [320, 390, 640, 700, 768, 769, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(".navbar-toggle")).toBeVisible({ visible: width <= 768 });
      await expect(page.locator(".navbar-primary")).toBeVisible({ visible: width > 768 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const rects = await page.locator(".navbar > :visible").evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".navbar-toggle").click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(".nav-drawer")).toBeHidden();
    await expect(page.locator(".brand")).toBeFocused();
    await expect(page.locator("html")).not.toHaveCSS("overflow-y", "hidden");
    await page.setViewportSize({ width: 320, height: 700 });
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
    await page.locator(".navbar-toggle").click();
    await expect(page.locator(".drawer-close")).toBeInViewport();
    for (const anchor of await page.locator(".drawer-links a").all()) await expect(anchor).toBeInViewport();
    expect(await page.locator(".nav-drawer").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
