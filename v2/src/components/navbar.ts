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
  for (const id of page === "home" ? [] : ["works", "about", "posts"] as const) {
    const item = element("li", "");
    const href = localeHref(locale, "", id);
    const anchor = link(copy[`${id}Label`], href, "nav-link button button--quiet");
    if (id === page) anchor.setAttribute("aria-current", "page");
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
  const toggle = element("button", "navbar-toggle navbar-control button button--quiet");
  toggle.type = "button";
  toggle.setAttribute("aria-label", copy.openNavigation);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "nav-drawer");
  const icon = element("span", "hamburger");
  icon.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) icon.append(element("span", ""));
  toggle.append(icon);

  const drawer = element("dialog", "nav-drawer");
  drawer.id = "nav-drawer";
  drawer.setAttribute("aria-label", copy.navigation);
  const close = element("button", "drawer-close navbar-control button button--quiet", "×");
  close.type = "button";
  close.autofocus = true;
  close.setAttribute("aria-label", copy.closeNavigation);
  const drawerNav = element("nav", "");
  drawerNav.setAttribute("aria-label", copy.navigation);
  const items = primary.cloneNode(true) as HTMLUListElement;
  items.className = "drawer-links";
  const githubItem = element("li", "");
  githubItem.append(github.cloneNode(true));
  items.append(githubItem);
  drawerNav.append(items);
  drawer.append(close, drawerNav);

  // Keep this in sync with the navigation-only CSS breakpoint.
  const compact = matchMedia("(max-width: 48rem)");
  const finishClose = () => {
    if (drawer.open) return;
    toggle.setAttribute("aria-expanded", "false");
    (compact.matches ? toggle : brand).focus({ preventScroll: true });
  };
  toggle.addEventListener("click", (event) => {
    // WebKit can match :focus-visible after pointer-triggered dialog autofocus.
    // Keyboard/assistive activation has detail 0 and keeps its focus indicator.
    close.classList.toggle("pointer-open", event.detail > 0);
    drawer.showModal();
    toggle.setAttribute("aria-expanded", "true");
    close.focus();
  });
  close.addEventListener("click", () => drawer.close());
  drawer.addEventListener("close", finishClose);
  drawerNav.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) drawer.close();
  });
  // A backdrop pointer sequence must start and finish outside the panel.
  const outside = (event: PointerEvent | MouseEvent) => {
    const rect = drawer.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom;
  };
  let backdropStart = false;
  drawer.addEventListener("pointerdown", (event) => { backdropStart = outside(event); });
  drawer.addEventListener("click", (event) => {
    if (backdropStart && outside(event)) drawer.close();
    backdropStart = false;
  });
  // Native modality makes the page inert; wrap Tab without visiting browser chrome.
  drawer.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    close.classList.remove("pointer-open");
    const last = items.querySelector<HTMLAnchorElement>("li:last-child a")!;
    if (event.shiftKey && document.activeElement === close) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      close.focus();
    }
  });
  compact.addEventListener("change", () => {
    if (!compact.matches && drawer.open) drawer.close();
  });
  nav.append(brand);
  if (page !== "home") nav.append(primary);
  nav.append(actions, toggle);
  header.append(nav, drawer);
  return header;
}
