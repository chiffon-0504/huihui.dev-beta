import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { content, localeHref, localeLinks, locales, resolveLocale } from "../../v2/src/content.ts";

describe("v2 localized shell", () => {
  test.each([
    ["zh-Hant", "作品", "關於"],
    ["en", "Works", "About"],
    ["ja", "制作実績", "プロフィール"],
  ])("%s defines shared navigation and section labels", (locale, worksLabel, aboutLabel) => {
    expect(content[locale].worksLabel).toBe(worksLabel);
    expect(content[locale].aboutLabel).toBe(aboutLabel);
  });

  for (const locale of locales) {
    test(`${locale} has a matching entry and complete shared content`, async () => {
      expect(resolveLocale(locale)).toBe(locale);
      for (const value of Object.values(content[locale])) expect(value.trim()).not.toBe("");
      const route = localeLinks[locale].href;
      const html = await readFile(new URL(`../../v2${route}index.html`, import.meta.url), "utf8");
      expect(html).toContain(`<html lang="${locale}">`);
      expect(html).toContain('src="/src/main.ts"');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain("<noscript>");
      expect(html).not.toMatch(/(?:style\.css|\/js\/|vendor\/)/);
    });
  }

  test("unknown languages fall back to the default locale", () => {
    expect(resolveLocale("fr")).toBe("zh-Hant");
  });

  test.each([
    ["zh-Hant", "主題", "自動", "淺色", "深色"],
    ["en", "Theme", "Auto", "Light", "Dark"],
    ["ja", "テーマ", "自動", "ライト", "ダーク"],
  ])("%s defines theme labels independently from the navbar", (locale, theme, auto, light, dark) => {
    expect(content[locale]).toMatchObject({ theme, themeAuto: auto, themeLight: light, themeDark: dark });
  });

  test.each([
    ["zh-Hant", "/", "中文", "繁體中文"],
    ["en", "/en/", "English", "English"],
    ["ja", "/ja/", "日本語", "日本語"],
  ])("%s language links preserve localized Home sections", (locale, route, trigger, label) => {
    expect(localeLinks[locale].shortLabel).toBe(trigger);
    expect(localeLinks[locale].label).toBe(label);
    expect(localeHref(locale)).toBe(route);
    for (const hash of ["#works", "#about"]) expect(localeHref(locale, hash)).toBe(`${route}${hash}`);
  });
});

function luminance(hex) {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

test.each(["light", "dark"])("v2 %s text and focus tokens meet contrast requirements on both surfaces", async (theme) => {
  const css = await readFile(new URL("../../v2/src/styles/tokens.css", import.meta.url), "utf8");
  const palette = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))?.[1];
  expect(palette).toBeDefined();
  const colors = Object.fromEntries([...palette.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/g)].map((match) => [match[1], match[2]]));
  for (const foreground of ["text", "muted", "accent", "focus"]) {
    for (const background of ["background", "surface"]) {
      const values = [luminance(colors[foreground]), luminance(colors[background])].sort((a, b) => b - a);
      const ratio = (values[0] + 0.05) / (values[1] + 0.05);
      expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(foreground === "focus" ? 3 : 4.5);
    }
  }
});
