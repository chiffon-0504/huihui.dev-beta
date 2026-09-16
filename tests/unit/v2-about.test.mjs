import { expect, test } from "vitest";
import { localeHref, resolveLocale, resolvePage } from "../../v2/src/locales/index.ts";

test.each([
  ["zh-Hant", "/about/"], ["en", "/en/about/"], ["ja", "/ja/about/"],
])("%s resolves About entries and keeps page and fragments in localized URLs", (locale, route) => {
  expect(localeHref(locale, "", "about")).toBe(route);
  expect(localeHref(locale, "#interests", "about")).toBe(`${route}#interests`);
  for (const path of [route, `${route}index.html`, route.slice(0, -1)]) {
    expect(resolveLocale(path)).toBe(locale);
    expect(resolvePage(path)).toBe("about");
  }
  expect(resolvePage(localeHref(locale))).toBe("home");
});

test.each(["/en/aboutness/", "/ja/about/extra/", "/en/contact/", "/ja/posts/extra/", "/fr/about/"])(
  "unimplemented path %s does not select an About entry", (path) => {
    expect(resolvePage(path)).toBe("home");
    expect(resolveLocale(path)).toBe("zh-Hant");
  },
);
