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
    await expect(page.locator(".hero-actions a")).toHaveText([copy.heroWorksCta, copy.heroAboutCta]);
    await expect(page.locator(".works-introduction .section-description")).toHaveText(copy.works);
    await expect(page.locator(".about-lead")).toHaveText(copy.aboutLead);
    await expect(page.locator("#about .section-description")).toHaveText([copy.about, copy.aboutInterests]);
    await expect(page.locator("#about a")).toHaveText(`${copy.aboutCta} (${copy.currentSite})`);
    await expect(page.locator("#works .section-heading a")).toHaveText(`${copy.worksCta} (${copy.currentSite})`);
    await expect(page.locator(".project-category")).toHaveText([copy.websiteCategory, copy.toolCategory]);
    await expect(page.locator(".project-title")).toHaveText([copy.websiteTitle, copy.toolTitle]);
    await expect(page.locator(".home-project .section-description")).toHaveText([copy.websiteDescription, copy.toolDescription]);
    await expect(page.locator(".home-project a")).toHaveText([copy.websiteCta, `${copy.toolCta} (${copy.currentSite})`]);
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
