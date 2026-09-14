import zhHant from "./zh-Hant";
import en from "./en";
import ja from "./ja";
import { supportedLocales, type Locale, type LocaleContent } from "./types";

export { supportedLocales, type Locale, type LocaleContent } from "./types";

export const locales: Readonly<Record<Locale, LocaleContent>> = {
  "zh-Hant": zhHant,
  en,
  ja,
};

const routes: Readonly<Record<Locale, string>> = {
  "zh-Hant": "/",
  en: "/en/",
  ja: "/ja/",
};

// Only the existing Home entries select a language; this is not a page router.
export function resolveLocale(pathname: string): Locale {
  return supportedLocales.find((locale) => {
    const route = routes[locale];
    return pathname === route || pathname === `${route}index.html` || pathname === route.slice(0, -1);
  }) ?? "zh-Hant";
}

export function getContent(locale: Locale): LocaleContent {
  // Fail explicitly if an untyped caller supplies invalid internal state.
  if (!supportedLocales.includes(locale)) throw new Error(`Unsupported v2 locale: ${locale}`);
  return locales[locale];
}

export function localeHref(locale: Locale, hash = ""): string {
  getContent(locale);
  return `${routes[locale]}${hash}`;
}
