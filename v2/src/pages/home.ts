import { getContent, localeHref, type Locale } from "../locales";
import { element, link } from "../dom";

export function createHome(locale: Locale): HTMLElement {
  const copy = getContent(locale);
  const main = element("main", "container home");
  main.id = "main-content";
  main.tabIndex = -1;

  // Until their v2 milestones land, full pages live on the current site.
  const currentPage = (path: string) => `https://huihui.dev${localeHref(locale)}${path}/`;
  const currentLink = (label: string, path: string) => {
    const anchor = link(label, currentPage(path), "home-text-link");
    anchor.append(element("span", "home-link-context", ` (${copy.currentSite})`));
    return anchor;
  };

  const hero = element("section", "hero");
  hero.setAttribute("aria-labelledby", "home-title");
  const introduction = element("div", "hero-copy");
  const title = element("h1", "hero-title", copy.title);
  title.id = "home-title";
  const actions = element("div", "hero-actions");
  actions.append(
    link(copy.heroWorksCta, "#works", "home-primary-link"),
    link(copy.heroAboutCta, "#about", "home-text-link"),
  );
  introduction.append(
    element("p", "eyebrow", copy.eyebrow),
    title,
    element("p", "hero-introduction", copy.introduction),
    actions,
  );

  // An abstract interface sketch: decorative, with no controls or tab stops.
  const visual = element("div", "hero-visual");
  visual.setAttribute("aria-hidden", "true");
  const sketch = element("div", "hero-sketch");
  sketch.append(element("div", "sketch-heading"), element("div", "sketch-line"));
  const tiles = element("div", "sketch-tiles");
  tiles.append(element("div", "sketch-tile"), element("div", "sketch-tile"));
  sketch.append(tiles);
  visual.append(sketch);
  hero.append(introduction, visual);

  const about = element("section", "home-section home-about");
  about.id = "about";
  about.tabIndex = -1;
  about.setAttribute("aria-labelledby", "about-title");
  const aboutHeading = element("h2", "section-title", copy.aboutLabel);
  aboutHeading.id = "about-title";
  const aboutBody = element("div", "about-copy");
  aboutBody.append(
    element("p", "about-lead", copy.aboutLead),
    element("p", "section-description", copy.about),
    element("p", "section-description", copy.aboutInterests),
    currentLink(copy.aboutCta, "about"),
  );
  about.append(aboutHeading, aboutBody);

  const works = element("section", "home-section home-works");
  works.id = "works";
  works.tabIndex = -1;
  works.setAttribute("aria-labelledby", "works-title");
  const worksHeading = element("h2", "section-title", copy.worksLabel);
  worksHeading.id = "works-title";
  const worksIntro = element("div", "works-introduction");
  worksIntro.append(worksHeading, element("p", "section-description", copy.works));
  const worksHeader = element("div", "section-heading");
  worksHeader.append(worksIntro, currentLink(copy.worksCta, "works"));
  const projects = element("div", "home-projects");
  const website = element("article", "home-project");
  website.append(
    element("p", "project-category", copy.websiteCategory),
    element("h3", "project-title", copy.websiteTitle),
    element("p", "section-description", copy.websiteDescription),
    link(copy.websiteCta, "https://github.com/chiffon-0504/huihui.dev-beta", "home-text-link"),
  );
  const tool = element("article", "home-project");
  tool.append(
    element("p", "project-category", copy.toolCategory),
    element("h3", "project-title", copy.toolTitle),
    element("p", "section-description", copy.toolDescription),
    currentLink(copy.toolCta, "tools/tier-maker"),
  );
  projects.append(website, tool);
  works.append(worksHeader, projects);
  main.append(hero, about, works);
  return main;
}
