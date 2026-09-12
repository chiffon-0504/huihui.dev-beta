import { content, localeHref, localeLinks, locales, type Locale } from "../content";
import { element, link } from "../dom";

export function createLanguageSwitcher(locale: Locale): HTMLDetailsElement {
  const dropdown = element("details", "language-switcher");
  const trigger = element("summary", "language-trigger", localeLinks[locale].shortLabel);
  trigger.setAttribute("aria-label", `${content[locale].languages}: ${localeLinks[locale].shortLabel}`);
  const options = element("ul", "language-options");
  const links = locales.map((language) => {
    const item = element("li", "");
    const option = link(localeLinks[language].label, localeHref(language, window.location.hash), "language-option");
    option.lang = language;
    option.hreflang = language;
    if (language === locale) option.setAttribute("aria-current", "page");
    option.addEventListener("click", () => {
      // The current-language link may stay in this document instead of loading a page.
      if (language === locale) trigger.focus();
      dropdown.open = false;
    });
    const selected = element("span", "language-selected", language === locale ? "✓" : "");
    selected.setAttribute("aria-hidden", "true");
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
    for (const [index, language] of locales.entries()) {
      links[index]!.href = localeHref(language, window.location.hash);
    }
  };
  dropdown.addEventListener("toggle", updateTargets);
  window.addEventListener("hashchange", updateTargets);
  return dropdown;
}
