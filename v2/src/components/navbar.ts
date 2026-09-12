import { content, localeLinks, type Locale } from "../content";
import { element, link } from "../dom";
import { createLanguageSwitcher } from "./language-switcher";

export function createNavbar(locale: Locale): HTMLElement {
  const header = element("header", "site-header");
  const nav = element("nav", "navbar container");
  nav.setAttribute("aria-label", content[locale].navigation);
  const brand = link("huihui.dev", localeLinks[locale].href, "brand");
  const primary = element("ul", "navbar-primary");
  for (const id of ["works", "about"] as const) {
    const item = element("li", "");
    item.append(link(content[locale][`${id}Label`], `#${id}`, "nav-link"));
    primary.append(item);
  }
  const actions = element("div", "navbar-actions");
  actions.append(link("GitHub", "https://github.com/chiffon-0504", "nav-link"), createLanguageSwitcher(locale));
  nav.append(brand, primary, actions);
  header.append(nav);
  return header;
}
