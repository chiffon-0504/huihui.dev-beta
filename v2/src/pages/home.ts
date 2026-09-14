import { getContent, localeHref, type Locale } from "../locales";
import { element, link } from "../dom";
import type { HomeTopic } from "../locales/types";

function topicList(topics: readonly HomeTopic[], className: string): HTMLElement {
  const list = element("div", className);
  for (const topic of topics) {
    const item = element("div", "home-topic");
    item.append(
      element("h3", "", topic.title),
      element("p", "section-description", topic.description),
    );
    list.append(item);
  }
  return list;
}

function section(id: string, label: string, className = ""): HTMLElement {
  const node = element("section", `home-section ${className}`);
  node.id = id;
  node.tabIndex = -1;
  node.setAttribute("aria-labelledby", `${id}-title`);
  const heading = element("h2", "section-title", label);
  heading.id = `${id}-title`;
  node.append(heading);
  return node;
}

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
    title,
    element("p", "hero-introduction", copy.introduction),
    actions,
  );

  hero.append(introduction);

  const about = section("about", copy.focusLabel, "home-about");
  about.append(
    topicList(copy.focus, "home-focus"),
    currentLink(copy.aboutCta, "about"),
  );

  const works = element("section", "home-section home-works");
  works.id = "works";
  works.tabIndex = -1;
  works.setAttribute("aria-labelledby", "works-title");
  const worksHeading = element("h2", "section-title", copy.worksHeading);
  worksHeading.id = "works-title";
  const worksIntro = element("div", "works-introduction");
  worksIntro.append(worksHeading, element("p", "section-description", copy.works));
  const worksHeader = element("div", "section-heading");
  worksHeader.append(worksIntro, currentLink(copy.worksCta, "works"));
  const projects = element("div", "home-projects");
  const website = element("article", "home-project");
  website.append(
    element("h3", "project-title", copy.websiteTitle),
    element("p", "section-description", copy.websiteDescription),
    link(copy.websiteCta, "https://github.com/chiffon-0504/huihui.dev-beta", "home-text-link"),
  );
  const tool = element("article", "home-project");
  tool.append(
    element("h3", "project-title", copy.toolTitle),
    element("p", "section-description", copy.toolDescription),
    currentLink(copy.toolCta, "tools/tier-maker"),
  );
  projects.append(website, tool);
  works.append(worksHeader, projects);
  const principles = section("principles", copy.principlesLabel, "home-principles");
  const principlesBody = element("div", "principles-copy");
  principlesBody.append(
    element("p", "principles-introduction", copy.principlesIntroduction),
    topicList(copy.principles, "home-topic-list"),
  );
  principles.append(principlesBody);

  const practice = element("div", "home-practice");
  const skills = section("skills", copy.skillsLabel);
  skills.append(topicList(copy.skills, "home-topic-list"));
  const interests = section("interests", copy.interestsLabel);
  interests.append(
    element("p", "section-description", copy.interestsIntroduction),
    topicList(copy.interests, "home-topic-list"),
  );
  practice.append(skills, interests);
  main.append(hero, works, about, principles, practice);
  return main;
}
