import { content, localeLinks, type Locale } from "../content";
import { element, link } from "../dom";
import type { ThemeController } from "../theme/controller";
import { createLanguageSwitcher } from "./language-switcher";
import { createThemeSwitcher } from "./theme-switcher";
import { createIcon } from "./icons";

export function createNavbar(locale: Locale, theme: ThemeController): HTMLElement {
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
  const github = link("GitHub", "https://github.com/chiffon-0504", "nav-link navbar-control");
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
