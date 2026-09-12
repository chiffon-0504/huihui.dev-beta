import { expect, test } from "@playwright/test";
import { applyPagesCsp } from "../support/csp-enforcement.mjs";

const locales = [
  { route: "/", lang: "zh-Hant", skip: "跳至主要內容", navigation: "主要導覽", worksLabel: "作品", aboutLabel: "關於" },
  { route: "/en/", lang: "en", skip: "Skip to main content", navigation: "Main navigation", worksLabel: "Works", aboutLabel: "About" },
  { route: "/ja/", lang: "ja", skip: "メインコンテンツへ移動", navigation: "メインナビゲーション", worksLabel: "制作実績", aboutLabel: "プロフィール" },
];

for (const locale of locales) {
  test(`${locale.lang} shares localized navigation and section labels`, async ({ page }) => {
    await page.goto(locale.route);
    const nav = page.getByRole("navigation", { name: locale.navigation });
    for (const [id, label] of [["works", locale.worksLabel], ["about", locale.aboutLabel]]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", `#${id}`);
      await expect(page.locator(`#${id}`).getByRole("heading", { level: 2, name: label, exact: true })).toBeVisible();
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
      await expect(nav.getByRole("link")).toHaveCount(4);
      await expect(nav.getByRole("link", { name: "huihui.dev", exact: true })).toHaveAttribute("href", locale.route);
      await expect(nav.getByRole("link", { name: locale.worksLabel, exact: true })).toHaveAttribute("href", "#works");
      await expect(nav.getByRole("link", { name: locale.aboutLabel, exact: true })).toHaveAttribute("href", "#about");
      await expect(nav.getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", "https://github.com/chiffon-0504");
      await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("hreflang", locale.lang);
      await expect(page.getByRole("contentinfo").getByRole("link")).toHaveCount(0);
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
      for (const [navIndex, label] of ["huihui.dev", locale.worksLabel, locale.aboutLabel, "GitHub"].entries()) {
        await page.keyboard.press("Tab");
        const current = nav.getByRole("link", { name: label, exact: true });
        await expect(current).toBeFocused();
        await expect(current).toBeInViewport();
        expect(await current.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
        const sectionId = navIndex === 1 ? "works" : navIndex === 2 ? "about" : null;
        if (sectionId) {
          await page.keyboard.press("Enter");
          await expect(page.locator(`#${sectionId}`)).toBeFocused();
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
    for (const link of await page.getByRole("navigation").first().getByRole("link").all()) {
      await expect(link).toBeVisible();
    }
  });
}
