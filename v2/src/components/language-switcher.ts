import { getContent, localeHref, supportedLocales, type Locale, type Page } from "../locales";
import { element, link } from "../dom";
import { createIcon } from "./icons";

export function createLanguageSwitcher(locale: Locale, page: Page): HTMLDetailsElement {
  const copy = getContent(locale);
  const dropdown = element("details", "language-switcher");
  const trigger = element("summary", "language-trigger navbar-control button button--quiet", copy.language.shortLabel);
  trigger.setAttribute("aria-label", `${copy.languages}: ${copy.language.shortLabel}`);
  const options = element("ul", "language-options");
  const links = supportedLocales.map((language) => {
    const item = element("li", "");
    const option = link(getContent(language).language.label, localeHref(language, window.location.hash, page), "language-option button button--quiet");
    option.lang = language;
    option.hreflang = language;
    if (language === locale) option.setAttribute("aria-current", "page");
    option.addEventListener("click", () => {
      // The current-language link may stay in this document instead of loading a page.
      if (language === locale) trigger.focus();
      dropdown.open = false;
    });
    const selected = element("span", "language-selected");
    selected.setAttribute("aria-hidden", "true");
    if (language === locale) selected.append(createIcon("check"));
    option.prepend(selected);
    item.append(option);
    options.append(item);
    return option;
  });
  dropdown.append(trigger, options);

  // Native disclosure and links remain usable without these enhancements.
  dropdown.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dropdown.open) {
      event.preventDefault();
      dropdown.open = false;
      trigger.focus();
    }
  });
  dropdown.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && !dropdown.contains(event.relatedTarget)) {
      dropdown.open = false;
    }
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && !dropdown.contains(event.target)) dropdown.open = false;
  });
  const updateTargets = () => {
    for (const [index, language] of supportedLocales.entries()) {
      links[index]!.href = localeHref(language, window.location.hash, page);
    }
  };
  dropdown.addEventListener("toggle", updateTargets);
  window.addEventListener("hashchange", updateTargets);
  return dropdown;
}
