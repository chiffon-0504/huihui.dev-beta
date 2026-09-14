import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { getContent, localeHref, locales as content, supportedLocales, resolveLocale } from "../../v2/src/locales/index.ts";

describe("v2 localized shell", () => {
  test.each([
    ["zh-Hant", "作品", "關於"],
    ["en", "Works", "About"],
    ["ja", "制作実績", "プロフィール"],
  ])("%s defines shared navigation and section labels", (locale, worksLabel, aboutLabel) => {
    expect(content[locale].worksLabel).toBe(worksLabel);
    expect(content[locale].aboutLabel).toBe(aboutLabel);
  });

  test("the canonical registry contains exactly the three supported locales", () => {
    expect(supportedLocales).toEqual(["zh-Hant", "en", "ja"]);
    expect(Object.keys(content)).toEqual(supportedLocales);
  });

  for (const locale of supportedLocales) {
    test(`${locale} has a matching entry and complete shared content`, async () => {
      const { language, focus, principles, skills, interests, ...copy } = getContent(locale);
      expect(Object.keys(getContent(locale)).sort()).toEqual(Object.keys(content.en).sort());
      for (const value of [...Object.values(copy), ...Object.values(language)]) expect(value.trim()).not.toBe("");
      for (const topics of [focus, principles, skills, interests]) {
        expect(topics).toHaveLength(3);
        for (const topic of topics) {
          expect(topic.title.trim()).not.toBe("");
          expect(topic.description.trim()).not.toBe("");
        }
      }
      const route = localeHref(locale);
      expect(resolveLocale(route)).toBe(locale);
      expect(resolveLocale(`${route}index.html`)).toBe(locale);
      if (route !== "/") expect(resolveLocale(route.slice(0, -1))).toBe(locale);
      const html = await readFile(new URL(`../../v2${route}index.html`, import.meta.url), "utf8");
      expect(html).toContain(`<html lang="${locale}">`);
      expect(html).toContain('src="/src/main.ts"');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain("<noscript>");
      expect(html).not.toMatch(/(?:style\.css|\/js\/|vendor\/)/);
    });
  }

  test("unknown paths select a complete default locale without adding routes", () => {
    for (const path of ["/fr/", "/english/", "/ja/works/"]) {
      expect(resolveLocale(path)).toBe("zh-Hant");
      expect(getContent(resolveLocale(path))).toBe(content["zh-Hant"]);
    }
  });

  test.each(["fr", "", "constructor", "__proto__", undefined, null])("invalid internal locale %s fails explicitly", (locale) => {
    expect(() => getContent(locale)).toThrow(/Unsupported v2 locale/);
    expect(() => localeHref(locale, "#works")).toThrow(/Unsupported v2 locale/);
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
    expect(getContent(locale).language.shortLabel).toBe(trigger);
    expect(getContent(locale).language.label).toBe(label);
    expect(resolveLocale(route)).toBe(locale);
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

test("v2 dark foundation and large surfaces are neutral while light tokens stay unchanged", async () => {
  const css = await readFile(new URL("../../v2/src/styles/tokens.css", import.meta.url), "utf8");
  const palette = (theme) => Object.fromEntries([...css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))[1].matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/g)].map((match) => [match[1], match[2]]));
  expect(palette("dark")).toMatchObject({ background: "#000000", surface: "#0a0a0a", border: "#404040", text: "#ededed", muted: "#b8b8b8" });
  expect(palette("light")).toEqual({ background: "#fafaf9", surface: "#ffffff", text: "#202522", muted: "#5b625d", border: "#d9ddd8", accent: "#294e3b", focus: "#1264a3" });
});

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
