import { element } from "../dom";
import { getContent, localeHref, type Locale } from "../locales";
import { createWorkCard, type WorkCard } from "../components/work-card";
import { workImages, workImageSizes } from "../media/works";

export function createWorks(locale: Locale): HTMLElement {
  const copy = getContent(locale).worksPage;
  const main = element("main", "container works");
  main.id = "main-content";
  main.tabIndex = -1;
  const intro = element("header", "works-intro");
  intro.append(element("h1", "", copy.title), element("p", "works-lead", copy.introduction));
  const items: readonly WorkCard[] = [
    {
      ...copy.website,
      link: { href: "https://github.com/chiffon-0504/huihui.dev-beta", label: copy.website.linkLabel },
      image: { asset: workImages.fuji, alt: copy.website.alt, sizes: workImageSizes, loading: "eager" },
    },
    {
      ...copy.tool,
      link: { href: `https://huihui.dev${localeHref(locale)}tools/tier-maker/`, label: copy.tool.linkLabel },
    },
    {
      ...copy.photography,
      image: { asset: workImages.yokohama, alt: copy.photography.alt, sizes: workImageSizes },
    },
  ];
  const grid = element("div", "works-grid");
  grid.append(...items.map(createWorkCard));
  main.append(intro, grid);
  return main;
}
