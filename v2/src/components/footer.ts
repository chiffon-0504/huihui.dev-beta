import { content, localeLinks, locales, type Locale } from "../content";
import { element, link } from "../dom";

export function createFooter(locale: Locale): HTMLElement {
  const footer = element("footer", "site-footer");
  const inner = element("div", "footer-inner container");
  const copyright = element("p", "copyright", `© ${new Date().getFullYear()} huihui.dev`);
  const languages = element("nav", "language-links");
  languages.setAttribute("aria-label", content[locale].languages);
  for (const language of locales) {
    const item = link(localeLinks[language].label, localeLinks[language].href);
    item.lang = language;
    item.hreflang = language;
    if (language === locale) item.setAttribute("aria-current", "page");
    languages.append(item);
  }
  inner.append(copyright, languages);
  footer.append(inner);
  return footer;
}
