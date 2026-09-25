import { expect, test } from "@playwright/test";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";

for (const locale of supportedLocales) {
  test(`${locale} renders canonical desktop copy and shared accessible labels`, async ({ page }) => {
    const copy = getContent(locale);
    await page.goto(localeHref(locale));
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveAccessibleName(copy.home.title);
    await expect(page.locator(".desktop-version")).toHaveText("V2.0.0");
    await expect(page.locator("#playing h2")).toHaveText(copy.home.playing);
    const bishoujoTitle = { "zh-Hant": "美少女遊戲", en: "Bishoujo Games", ja: "美少女ゲーム" }[locale];
    await expect(page.locator("#bishoujo h2")).toHaveText(bishoujoTitle);
    expect(copy.home.bishoujo).toBe(bishoujoTitle);
    const memoriesTitle = { "zh-Hant": "回憶", en: "Memories", ja: "思い出" }[locale];
    await expect(page.locator("#memories h2")).toHaveText(memoriesTitle);
    expect(copy.home.memories).toBe(memoriesTitle);
    await expect(page.locator("#clock .desktop-muted")).toHaveText(copy.home.localTime);
    await expect(page.locator("#version .desktop-muted")).toHaveText(copy.home.development);
    await expect(page.locator(".desktop-notes li")).toHaveText([...copy.home.notes]);
    await expect(page.locator("#version a")).toHaveCount(0);
    await expect(page.locator("#status dt")).toHaveText([copy.home.website, "API"]);
    for (const title of await page.locator(".window-titlebar").all()) {
      await expect(title).toHaveAccessibleName(await title.locator("h2").innerText());
      await expect(title).toHaveAccessibleDescription(copy.home.keyboardMove);
    }
    await expect(page.locator(".skip-link")).toHaveAccessibleName(copy.skip);
    await expect(page.getByRole("navigation")).toHaveAccessibleName(copy.navigation);
    await expect(page.locator("summary")).toHaveAccessibleName(`${copy.languages}: ${copy.language.shortLabel}`);
    await page.locator(".theme-trigger").click();
    await expect(page.getByRole("menu")).toHaveAccessibleName(copy.theme);
    await expect(page.getByRole("menuitemradio")).toHaveText([copy.themeAuto, copy.themeLight, copy.themeDark]);
  });
}
