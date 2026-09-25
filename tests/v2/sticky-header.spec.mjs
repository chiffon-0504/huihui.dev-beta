import { expect, test } from "@playwright/test";
import { applyPagesCsp } from "../support/csp-enforcement.mjs";
import { mockSystemStatus } from "../support/v2-system-status.mjs";

const locales = [
  { route: "/", lang: "zh-Hant", light: "淺色", dark: "深色" },
  { route: "/en/", lang: "en", light: "Light", dark: "Dark" },
  { route: "/ja/", lang: "ja", light: "ライト", dark: "ダーク" },
];

for (const locale of locales) {
  for (const width of [1440, 390]) {
    test(`${locale.lang} sticky header and navigation after scrolling at ${width}px`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 844 });
      await applyPagesCsp(page, baseURL);
      await mockSystemStatus(page);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${locale.route}about/`);
      const header = page.getByRole("banner");
      const theme = page.locator(".theme-trigger");
      const language = page.locator(".language-trigger");
      const toggle = page.locator(".navbar-toggle");
      const drawer = page.getByRole("dialog");
      const geometry = () => page.evaluate(() => {
        const header = document.querySelector(".site-header").getBoundingClientRect();
        return {
          x: header.x, y: header.y, width: header.width, height: header.height,
          mainTop: document.querySelector("main").getBoundingClientRect().top + scrollY,
          documentHeight: document.documentElement.scrollHeight,
        };
      });
      const expectPinned = async (initial) => {
        await expect.poll(async () => Math.abs((await header.boundingBox()).y)).toBeLessThanOrEqual(1);
        expect(await geometry()).toEqual(initial);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      };
      const scroll = async (fraction) => {
        await page.evaluate((value) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * value), fraction);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
      };

      for (const mode of ["dark", "light"]) {
        await page.evaluate(() => scrollTo(0, 0));
        await theme.click();
        await page.getByRole("menuitemradio", { name: locale[mode], exact: true }).click();
        await expect(header).toHaveCSS("background-color", mode === "dark" ? "rgb(10, 10, 10)" : "rgb(255, 255, 255)");
        const initial = await geometry();
        expect(initial.y).toBe(0);
        expect(initial.x).toBe(0);
        expect(initial.width).toBe(await page.evaluate(() => document.documentElement.clientWidth));
        for (const fraction of [0.5, 1]) {
          await scroll(fraction);
          await expectPinned(initial);
        }
        const scrolledY = await page.evaluate(() => scrollY);
        // Actionability checks also reject content covering the header controls.
        await page.locator(".brand").click({ trial: true });
        await language.click();
        for (const option of await page.locator(".language-option").all()) await option.click({ trial: true });
        await page.keyboard.press("Escape");
        await expect(language).toBeFocused();
        await theme.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(theme).toBeFocused();
        await theme.click();
        const nextMode = mode === "dark" ? "light" : "dark";
        await page.getByRole("menuitemradio", { name: locale[nextMode], exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", nextMode);

        if (width === 390) {
          await page.keyboard.press("Tab");
          await expect(toggle).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(drawer).toBeVisible();
          await expect(page.locator(".drawer-close")).toBeFocused();
          await expect(page.locator("html")).toHaveCSS("overflow-y", "hidden");
          const box = await drawer.boundingBox();
          expect(box.x).toBe(0);
          expect(box.y).toBe(0);
          expect(box.width).toBe(width);
          expect(Math.abs(box.height - 844)).toBeLessThanOrEqual(1 / 64);
        }
        const links = page.locator(width === 390 ? ".drawer-links a" : ".navbar-primary a, .navbar-actions > a");
        await expect(links).toHaveCount(4);
        for (const link of await links.all()) await link.click({ trial: true });
        if (width === 390) {
          await page.keyboard.press("Escape");
          await expect(drawer).toBeHidden();
          await expect(toggle).toBeFocused();
          await expect(page.locator("html")).not.toHaveCSS("overflow-y", "hidden");
        }
        expect(await page.evaluate(() => scrollY)).toBe(scrolledY);
        await expectPinned(initial);
      }

      // Follow each local destination from a deeply scrolled About page.
      for (const destination of ["works/", "about/", "posts/", ""]) {
        await page.goto(`${locale.route}about/`);
        await scroll(1);
        await expect.poll(async () => Math.abs((await header.boundingBox()).y)).toBeLessThanOrEqual(1);
        if (destination && width === 390) await toggle.click();
        const navigation = destination && width === 390 ? drawer : page.locator(".navbar-primary");
        const link = destination ? navigation.locator(`a[href="${locale.route}${destination}"]`) : page.locator(".brand");
        await link.click();
        await expect(page).toHaveURL(new URL(`${locale.route}${destination}`, baseURL).href);
      }
      await page.goto(`${locale.route}about/`);
      await scroll(1);
      await language.click();
      await page.locator('.language-option[hreflang="en"]').click();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      expect(errors).toEqual([]);
    });

    test(`${locale.lang} fragment headings clear the sticky header at ${width}px`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 844 });
      await applyPagesCsp(page, baseURL);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      const header = page.getByRole("banner");
      const expectHeadingClear = async (hash) => {
        const target = page.locator(hash);
        await expect(target).toHaveCount(1);
        const heading = /-title$/.test(hash) ? target : target.getByRole("heading").first();
        await expect(heading).toBeInViewport();
        await expect.poll(async () => {
          const gap = await page.locator("html").evaluate((node) => parseFloat(getComputedStyle(node).fontSize) / 2);
          const box = await header.boundingBox();
          return (await heading.boundingBox()).y - (box.y + box.height) - gap;
        }).toBeGreaterThanOrEqual(-1);
        expect(Math.abs((await header.boundingBox()).y)).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      };
      const article = "arcaea-course-mode-phase-10-clear-2026-07-31";
      for (const hash of ["#rhythm-games", `#${article}`, `#${article}-title`]) {
        await page.goto(`${locale.route}posts/${hash}`);
        await expectHeadingClear(hash);
        // The existing language control preserves the same category/article fragment.
        for (const destination of locales) {
          await page.locator(".language-trigger").click();
          const link = page.locator(`.language-option[hreflang="${destination.lang}"]`);
          await expect(link).toHaveAttribute("href", `${destination.route}posts/${hash}`);
          await link.click();
          await expect(page).toHaveURL(new URL(`${destination.route}posts/${hash}`, baseURL).href);
          await expectHeadingClear(hash);
        }
      }
      await page.goto(`${locale.route}posts/`);
      const permalink = page.locator(`#${article} .post-title-link`);
      await permalink.click();
      await expect(page).toHaveURL(new URL(`${locale.route}posts/#${article}`, baseURL).href);
      await expectHeadingClear(`#${article}`);
      // Font enlargement and wrapping change the actual header height.
      await page.setViewportSize({ width: width === 390 ? 320 : 769, height: 900 });
      await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
      await page.evaluate(() => scrollTo(0, 0));
      await permalink.click();
      await expectHeadingClear(`#${article}`);
      expect(errors).toEqual([]);
    });
  }
}
