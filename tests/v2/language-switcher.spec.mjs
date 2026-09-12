import { expect, test } from "@playwright/test";
import { applyPagesCsp } from "../support/csp-enforcement.mjs";

const locales = [
  { lang: "zh-Hant", route: "/", trigger: "中文", label: "繁體中文", name: "語言: 中文" },
  { lang: "en", route: "/en/", trigger: "English", label: "English", name: "Language: English" },
  { lang: "ja", route: "/ja/", trigger: "日本語", label: "日本語", name: "言語: 日本語" },
];

async function expectContained(page, dropdown) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const panel = dropdown.locator("ul");
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  for (const option of await dropdown.getByRole("link").all()) {
    await expect(option).toBeInViewport();
    // Hit testing also catches a panel painted underneath another element.
    expect(await option.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
  }
}

for (const locale of locales) {
  for (const width of [1440, 390]) {
    test(`${locale.lang} dropdown pointer and keyboard at ${width}px`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await applyPagesCsp(page, baseURL);
      await page.goto(locale.route);
      const dropdown = page.locator(".navbar details");
      const trigger = dropdown.locator("summary");
      await expect(dropdown).toHaveCount(1);
      await expect(trigger).toHaveText(locale.trigger);
      await expect(trigger).toHaveAccessibleName(locale.name);
      await expect(page.locator("footer nav, footer a[hreflang], footer .language-links")).toHaveCount(0);
      await expect(dropdown.getByRole("link")).toHaveCount(0);
      const headerBefore = await page.getByRole("banner").boundingBox();
      await trigger.click();
      await expect(dropdown).toHaveAttribute("open", "");
      await expect(dropdown.getByRole("link")).toHaveCount(3);
      for (const target of locales) {
        const option = dropdown.getByRole("link", { name: target.label, exact: true });
        await expect(option).toHaveAttribute("href", target.route);
        await expect(option).toHaveAttribute("lang", target.lang);
        await expect(option).toHaveAttribute("hreflang", target.lang);
        if (target.lang === locale.lang) {
          await expect(option).toHaveAttribute("aria-current", "page");
          await expect(option.locator("span")).toHaveText("✓");
          await expect(option.locator("span")).toHaveAttribute("aria-hidden", "true");
        } else {
          await expect(option).not.toHaveAttribute("aria-current");
          await expect(option.locator("span")).toBeEmpty();
        }
      }
      await expect(dropdown.locator('[aria-current="page"]')).toHaveCount(1);
      expect(await page.getByRole("banner").boundingBox()).toEqual(headerBefore);
      await expectContained(page, dropdown);
      if (testInfo.project.name === "chromium") {
        await page.screenshot({ path: testInfo.outputPath(`${locale.lang}-${width}-open.png`), fullPage: true });
      }
      await page.getByRole("heading", { level: 1 }).click();
      await expect(dropdown).not.toHaveAttribute("open");
      await trigger.click();
      await trigger.click();
      await expect(dropdown).not.toHaveAttribute("open");

      // Reach the trigger through the actual document tab order, without focus().
      await page.goto(locale.route);
      for (let index = 0; index < 6; index++) await page.keyboard.press("Tab");
      await expect(trigger).toBeFocused();
      expect(await trigger.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
      for (const key of ["Enter", "Space"]) {
        await page.keyboard.press(key);
        await expect(dropdown).toHaveAttribute("open", "");
        await page.keyboard.press("Tab");
        await expect(dropdown.getByRole("link", { name: "繁體中文", exact: true })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dropdown).not.toHaveAttribute("open");
        await expect(trigger).toBeFocused();
      }
      await page.keyboard.press("Enter");
      for (const target of locales) {
        await page.keyboard.press("Tab");
        const option = dropdown.getByRole("link", { name: target.label, exact: true });
        await expect(option).toBeFocused();
        expect(await option.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
      }
      for (let index = 0; index < 3; index++) await page.keyboard.press("Shift+Tab");
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("link", { name: "GitHub", exact: true })).toBeFocused();
      await expect(dropdown).not.toHaveAttribute("open");
    });
  }

  test(`${locale.lang} switches to every equivalent localized section`, async ({ page }) => {
    for (const hash of ["", "#works", "#about"]) {
      for (const target of locales) {
        await page.goto(`${locale.route}${hash}`);
        const dropdown = page.locator(".language-switcher");
        await dropdown.locator("summary").click();
        const option = dropdown.getByRole("link", { name: target.label, exact: true });
        await expect(option).toHaveAttribute("href", `${target.route}${hash}`);
        await option.click();
        await expect(page).toHaveURL(new RegExp(`${target.route}${hash}$`));
        await expect(page.locator("html")).toHaveAttribute("lang", target.lang);
        await expect(page.locator(".language-switcher")).not.toHaveAttribute("open");
      }
    }
    // A fragment changed by primary navigation must also update existing links.
    await page.goto(locale.route);
    await page.locator('.navbar a[href="#about"]').click();
    await page.locator("summary").click();
    for (const target of locales) {
      await expect(page.locator(".language-switcher").getByRole("link", { name: target.label, exact: true }))
        .toHaveAttribute("href", `${target.route}#about`);
    }
  });

  test(`${locale.lang} open dropdown reflows at 320px with enlarged text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.goto(locale.route);
    await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
    const dropdown = page.locator(".language-switcher");
    await dropdown.locator("summary").click();
    await expectContained(page, dropdown);
    await expect(dropdown.locator('[aria-current="page"] span')).toHaveText("✓");
  });
}

test("rendered native disclosure and links work without enhancement listeners", async ({ page }) => {
  await page.goto("/en/#works");
  // Cloning retains native markup while removing listeners on the component.
  await page.locator(".language-switcher").evaluate((node) => node.replaceWith(node.cloneNode(true)));
  const dropdown = page.locator(".language-switcher");
  await dropdown.locator("summary").click();
  await expect(dropdown).toHaveAttribute("open", "");
  await dropdown.getByRole("link", { name: "日本語", exact: true }).click();
  await expect(page).toHaveURL(/\/ja\/#works$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});
