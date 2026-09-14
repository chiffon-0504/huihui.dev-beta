import { expect, test } from "@playwright/test";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";

for (const locale of supportedLocales) {
  test(`${locale} renders canonical Home copy and shared accessible labels`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const copy = getContent(locale);
    await page.goto(localeHref(locale));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
    await expect(page.locator(".eyebrow")).toHaveText(copy.eyebrow);
    await expect(page.locator(".hero-introduction")).toHaveText(copy.introduction);
    await expect(page.locator(".placeholder-label")).toHaveText([copy.upcoming, copy.upcoming]);
    await expect(page.locator("#works .section-description")).toHaveText(copy.works);
    await expect(page.locator("#about .section-description")).toHaveText(copy.about);
    await expect(page.locator(".skip-link")).toHaveAccessibleName(copy.skip);
    await expect(page.getByRole("navigation")).toHaveAccessibleName(copy.navigation);
    await expect(page.locator("summary")).toHaveAccessibleName(`${copy.languages}: ${copy.language.shortLabel}`);
    await page.locator(".theme-trigger").click();
    await expect(page.getByRole("menu")).toHaveAccessibleName(copy.theme);
    await expect(page.getByRole("menuitemradio")).toHaveText([copy.themeAuto, copy.themeLight, copy.themeDark]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
