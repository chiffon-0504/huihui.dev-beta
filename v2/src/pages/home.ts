import { content, type Locale } from "../content";
import { element } from "../dom";

export function createHome(locale: Locale): HTMLElement {
  const copy = content[locale];
  const main = element("main", "container home");
  main.id = "main-content";
  main.tabIndex = -1;

  const hero = element("section", "hero");
  hero.setAttribute("aria-labelledby", "home-title");
  const title = element("h1", "hero-title", copy.title);
  title.id = "home-title";
  hero.append(
    element("p", "eyebrow", copy.eyebrow),
    title,
    element("p", "hero-introduction", copy.introduction),
  );

  const placeholders = element("div", "home-sections");
  for (const [id, label] of [["works", "Works"], ["about", "About"]] as const) {
    const section = element("section", "placeholder-section");
    section.id = id;
    section.tabIndex = -1;
    section.setAttribute("aria-labelledby", `${id}-title`);
    const heading = element("h2", "section-title", label);
    heading.id = `${id}-title`;
    const headingRow = element("div", "section-heading");
    headingRow.append(heading, element("span", "placeholder-label", copy.upcoming));
    section.append(headingRow, element("p", "section-description", copy[id]));
    placeholders.append(section);
  }
  main.append(hero, placeholders);
  return main;
}
