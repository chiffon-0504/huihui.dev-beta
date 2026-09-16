import zhHant from "./zh-Hant";
import en from "./en";
import ja from "./ja";
import { supportedLocales, type Locale, type LocaleContent, type Page } from "./types";

export { supportedLocales, type Locale, type LocaleContent, type Page } from "./types";

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

const pages: Readonly<Record<Page, string>> = { home: "", about: "about/", works: "works/", posts: "posts/" };

function matchesEntry(pathname: string, route: string): boolean {
  return pathname === route || pathname === `${route}index.html` || pathname === route.slice(0, -1);
}

// Resolve only emitted MPA entries; navigation still loads native HTML documents.
export function resolveLocale(pathname: string): Locale {
  return supportedLocales.find((locale) => Object.values(pages).some((path) =>
    matchesEntry(pathname, `${routes[locale]}${path}`))) ?? "zh-Hant";
}

export function resolvePage(pathname: string): Page {
  return (Object.keys(pages) as Page[]).find((page) => supportedLocales.some((locale) =>
    matchesEntry(pathname, localeHref(locale, "", page)))) ?? "home";
}

export function getContent(locale: Locale): LocaleContent {
  // Fail explicitly if an untyped caller supplies invalid internal state.
  if (!supportedLocales.includes(locale)) throw new Error(`Unsupported v2 locale: ${locale}`);
  return locales[locale];
}

export function localeHref(locale: Locale, hash = "", page: Page = "home"): string {
  getContent(locale);
  return `${routes[locale]}${pages[page]}${hash}`;
}
