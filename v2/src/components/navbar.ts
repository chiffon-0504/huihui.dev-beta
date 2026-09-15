import { getContent, localeHref, type Locale, type Page } from "../locales";
import { element, link } from "../dom";
import type { ThemeController } from "../theme/controller";
import { createLanguageSwitcher } from "./language-switcher";
import { createThemeSwitcher } from "./theme-switcher";
import { createIcon } from "./icons";

export function createNavbar(locale: Locale, theme: ThemeController, page: Page): HTMLElement {
  const copy = getContent(locale);
  const header = element("header", "site-header");
  const nav = element("nav", "navbar container");
  nav.setAttribute("aria-label", copy.navigation);
  const brand = link("huihui.dev", localeHref(locale), "brand");
  const primary = element("ul", "navbar-primary");
  for (const id of ["works", "about"] as const) {
    const item = element("li", "");
    const href = id === "about" ? localeHref(locale, "", "about") : page === "home" ? "#works" : localeHref(locale, "#works");
    const anchor = link(copy[`${id}Label`], href, "nav-link button button--quiet");
    if (id === "about" && page === "about") anchor.setAttribute("aria-current", "page");
    item.append(anchor);
    primary.append(item);
  }
  const actions = element("div", "navbar-actions");
  const github = link("GitHub", "https://github.com/chiffon-0504", "nav-link navbar-control button button--quiet");
  github.prepend(createIcon("github"));
  actions.append(
    github,
    createLanguageSwitcher(locale, page),
    createThemeSwitcher(locale, theme),
  );
  nav.append(brand, primary, actions);
  header.append(nav);
  return header;
}
