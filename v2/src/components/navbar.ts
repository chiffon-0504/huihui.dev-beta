import { getContent, localeHref, type Locale } from "../locales";
import { element, link } from "../dom";
import type { ThemeController } from "../theme/controller";
import { createLanguageSwitcher } from "./language-switcher";
import { createThemeSwitcher } from "./theme-switcher";
import { createIcon } from "./icons";

export function createNavbar(locale: Locale, theme: ThemeController): HTMLElement {
  const copy = getContent(locale);
  const header = element("header", "site-header");
  const nav = element("nav", "navbar container");
  nav.setAttribute("aria-label", copy.navigation);
  const brand = link("huihui.dev", localeHref(locale), "brand");
  const primary = element("ul", "navbar-primary");
  for (const id of ["works", "about"] as const) {
    const item = element("li", "");
    item.append(link(copy[`${id}Label`], `#${id}`, "nav-link button button--quiet"));
    primary.append(item);
  }
  const actions = element("div", "navbar-actions");
  const github = link("GitHub", "https://github.com/chiffon-0504", "nav-link navbar-control button button--quiet");
  github.prepend(createIcon("github"));
  actions.append(
    github,
    createLanguageSwitcher(locale),
    createThemeSwitcher(locale, theme),
  );
  nav.append(brand, primary, actions);
  header.append(nav);
  return header;
}
