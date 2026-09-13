import { expect, test } from "@playwright/test";
import { applyPagesCsp } from "../support/csp-enforcement.mjs";

const locales = [
  { route: "/", lang: "zh-Hant", label: "中文", theme: "主題", auto: "自動", light: "淺色", dark: "深色" },
  { route: "/en/", lang: "en", label: "English", theme: "Theme", auto: "Auto", light: "Light", dark: "Dark" },
  { route: "/ja/", lang: "ja", label: "日本語", theme: "テーマ", auto: "自動", light: "ライト", dark: "ダーク" },
];

test.use({ timezoneId: "Asia/Taipei" });

for (const locale of locales) {
  for (const [width, textScale] of [[1440, 1], [390, 1], [320, 2]]) {
    test(`${locale.lang} neutral themes and aligned SVG controls at ${width}px / ${textScale}x text`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.clock.setFixedTime(new Date("2026-09-12T23:00:00+08:00"));
      await applyPagesCsp(page, baseURL);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.goto(locale.route);
      await page.locator("html").evaluate((node, scale) => { node.style.fontSize = `${scale * 100}%`; }, textScale);
      const trigger = page.locator(".theme-trigger");
      const language = page.locator(".language-trigger");
      const github = page.getByRole("link", { name: "GitHub", exact: true });
      const controls = page.locator(".navbar-actions .navbar-control");

      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator("html")).toHaveCSS("background-color", "rgb(0, 0, 0)");
      await expect(page.getByRole("banner")).toHaveCSS("background-color", "rgb(10, 10, 10)");
      await expect(trigger).toHaveAccessibleName(`${locale.theme}: ${locale.dark}`);
      await expect(language).toHaveText(locale.label);
      await expect(language.locator("svg")).toHaveCount(0);
      await expect(language).toHaveCSS("list-style-type", "none");
      expect(await language.evaluate((node) => getComputedStyle(node, "::marker").content)).toBe('""');
      await expect(github.locator("svg")).toHaveAttribute("data-icon", "github");
      await expect(trigger.locator("svg")).toHaveAttribute("data-icon", "moon");
      for (const icon of [github.locator("svg"), trigger.locator("svg")]) {
        await expect(icon.locator("use")).toHaveAttribute("href", /^\/assets\/icons-[\w-]+\.svg#(?:github|moon)$/);
        await expect.poll(() => icon.evaluate((node) => node.getBBox().width)).toBeGreaterThan(0);
      }
      await expect(controls).toHaveCount(3);

      const geometry = await controls.evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const svg = node.querySelector("svg")?.getBoundingClientRect();
        return { x: rect.x, right: rect.right, top: rect.top, height: rect.height, center: rect.y + rect.height / 2, align: style.alignItems, lineHeight: style.lineHeight, paddingBlock: style.paddingBlock, svgCenter: svg && svg.y + svg.height / 2 };
      }));
      expect(new Set(geometry.map((value) => value.height)).size).toBe(1);
      expect(new Set(geometry.map((value) => value.lineHeight)).size).toBe(1);
      expect(new Set(geometry.map((value) => value.paddingBlock)).size).toBe(1);
      for (const value of geometry) {
        expect(value.align).toBe("center");
        expect(value.x).toBeGreaterThanOrEqual(0);
        expect(value.right).toBeLessThanOrEqual(width);
        expect(value.height).toBeGreaterThanOrEqual(44 * textScale);
        if (value.svgCenter !== undefined) expect(value.svgCenter).toBe(value.center);
      }
      // At enlarged text the existing wrapping layout may form multiple rows.
      // Controls on each row still share one axis, with identical heights.
      for (const top of new Set(geometry.map((value) => value.top))) {
        expect(new Set(geometry.filter((value) => value.top === top).map((value) => value.center)).size).toBe(1);
      }
      if (textScale === 1) expect(new Set(geometry.map((value) => value.center)).size).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const surfaces = () => page.locator("html, .site-header, .language-options, .theme-options").evaluateAll((nodes) => nodes.map((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, image: style.backgroundImage, border: style.borderBottomColor, color: style.color };
      }));
      const autoDark = await surfaces();
      for (const surface of autoDark) expect(surface.image).toBe("none");
      await trigger.click();
      await page.getByRole("menuitemradio", { name: locale.dark, exact: true }).click();
      expect(await surfaces()).toEqual(autoDark);
      await trigger.click();
      await page.getByRole("menuitemradio", { name: locale.light, exact: true }).click();
      await expect(page.locator("html")).toHaveCSS("background-color", "rgb(250, 250, 249)");
      await expect(page.getByRole("banner")).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(trigger).toHaveAccessibleName(`${locale.theme}: ${locale.light}`);
      await expect(trigger.locator("svg")).toHaveAttribute("data-icon", "sun");
      await expect.poll(() => trigger.locator("svg").evaluate((node) => node.getBBox().width)).toBeGreaterThan(0);
      if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath("light.png"), fullPage: true });
      await trigger.click();
      await page.getByRole("menuitemradio", { name: locale.auto, exact: true }).click();
      expect(await surfaces()).toEqual(autoDark);
      if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath("auto-dark.png"), fullPage: true });

      await language.click();
      await expect(page.locator(".language-switcher")).toHaveAttribute("open", "");
      await expect(page.locator('.language-selected svg[data-icon="check"]')).toHaveCount(1);
      await expect.poll(() => page.locator('.language-selected svg').evaluate((node) => node.getBBox().width)).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
      await expect(language).toBeFocused();
      await expect(page.locator(".language-switcher")).not.toHaveAttribute("open");

      // SVG paths are decorative, use the same geometry, and add no tab stops.
      for (const icon of await page.locator(".navbar svg").all()) {
        for (const [name, value] of [["viewBox", "0 0 24 24"], ["stroke-width", "2"], ["stroke", "currentColor"], ["fill", "none"], ["aria-hidden", "true"], ["focusable", "false"]]) {
          await expect(icon).toHaveAttribute(name, value);
        }
        await expect(icon).not.toHaveAttribute("tabindex");
        await expect(icon).toHaveCSS("width", `${20 * textScale}px`);
        await expect(icon).toHaveCSS("height", `${20 * textScale}px`);
      }
      expect(await page.locator(".navbar").textContent()).not.toMatch(/[☀☾✓▶▼]/u);
      expect(errors).toEqual([]);
    });
  }
}
