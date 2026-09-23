import { element, link } from "../dom";
import { getContent, localeHref, type Locale } from "../locales";
import type { HomeTopic } from "../locales/types";

function section(id: string, title: string): HTMLElement {
  const node = element("section", "about-section");
  node.id = id;
  node.tabIndex = -1;
  node.setAttribute("aria-labelledby", `${id}-title`);
  const heading = element("h2", "", title);
  heading.id = `${id}-title`;
  node.append(heading);
  return node;
}

function topics(items: readonly HomeTopic[]): HTMLElement {
  const list = element("dl", "about-topics");
  for (const item of items) {
    const row = element("div", "about-topic");
    row.append(element("dt", "", item.title), element("dd", "", item.description));
    list.append(row);
  }
  return list;
}

export function createAbout(locale: Locale): HTMLElement {
  const copy = getContent(locale).aboutPage;
  const main = element("main", "container about");
  main.id = "main-content";
  main.tabIndex = -1;
  const intro = element("header", "about-intro");
  intro.append(element("h1", "", copy.title), element("p", "about-lead", copy.introduction));

  const background = section("background", copy.backgroundTitle);
  const story = element("div", "about-story");
  for (const paragraph of copy.background) story.append(element("p", "", paragraph));
  background.append(story);

  const practice = section("practice", copy.practiceTitle);
  const practiceBody = element("div", "about-practice");
  practiceBody.append(topics(copy.practice), link(copy.worksCta, localeHref(locale, "", "works"), "button"));
  practice.append(practiceBody);

  const interests = section("interests", copy.interestsTitle);
  interests.append(topics(copy.interests));
  const music = section("music", copy.musicTitle);
  music.append(topics(copy.music));
  main.append(intro, background, practice, interests, music);
  return main;
}
