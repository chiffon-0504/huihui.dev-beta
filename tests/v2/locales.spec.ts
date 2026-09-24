import { expect, test } from "@playwright/test";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";

for (const locale of supportedLocales) {
  test(`${locale} renders canonical desktop copy and shared accessible labels`, async ({ page }) => {
    const copy = getContent(locale);
    await page.goto(localeHref(locale));
    await expect(page.locator("main h1")).toHaveText(copy.home.title);
    await expect(page.locator("#playing h2")).toHaveText(copy.home.playing);
    await expect(page.locator("#clock .desktop-muted")).toHaveText(copy.home.localTime);
    await expect(page.locator("#version .desktop-muted")).toHaveText(copy.home.development);
    await expect(page.locator(".desktop-notes li")).toHaveText([...copy.home.notes]);
    await expect(page.locator("#version a")).toHaveText(copy.home.source);
    await expect(page.locator("#status dt")).toHaveText([copy.home.website, "API"]);
    await expect(page.locator(".skip-link")).toHaveAccessibleName(copy.skip);
    await expect(page.getByRole("navigation")).toHaveAccessibleName(copy.navigation);
    await expect(page.locator("summary")).toHaveAccessibleName(`${copy.languages}: ${copy.language.shortLabel}`);
    await page.locator(".theme-trigger").click();
    await expect(page.getByRole("menu")).toHaveAccessibleName(copy.theme);
    await expect(page.getByRole("menuitemradio")).toHaveText([copy.themeAuto, copy.themeLight, copy.themeDark]);
  });
}
