import { element } from "../dom";
import { getContent, localeHref, type Locale } from "../locales";
import { createWorkCard, type WorkCard } from "../components/work-card";
import { workImages, workImageSizes } from "../media/works";
import { createImageViewer } from "../components/image-viewer";
import { createImage } from "../components/media";
import type { ImageOptions } from "../media/types";

export function createWorks(locale: Locale): HTMLElement {
  const copy = getContent(locale).worksPage;
  const main = element("main", "container works");
  main.id = "main-content";
  main.tabIndex = -1;
  const intro = element("header", "works-intro");
  intro.append(element("h1", "", copy.title), element("p", "works-lead", copy.introduction));
  const photos: readonly ImageOptions[] = [
    { asset: workImages.fuji, alt: copy.website.alt, sizes: workImageSizes, loading: "eager" },
    { asset: workImages.tsutenkaku, alt: copy.photography.alt, sizes: workImageSizes },
    { asset: workImages.shiba, alt: copy.photography.shibaAlt, sizes: workImageSizes },
  ];
  const viewer = createImageViewer(photos, copy.viewer);
  const items: readonly WorkCard[] = [
    {
      ...copy.website,
      link: { href: "https://github.com/chiffon-0504/huihui.dev-beta", label: copy.website.linkLabel },
    },
    {
      ...copy.tool,
      link: { href: `https://huihui.dev${localeHref(locale)}tools/tier-maker/`, label: copy.tool.linkLabel },
    },
    {
      ...copy.photography,
    },
  ];
  const grid = element("div", "works-grid");
  const cards = items.map(createWorkCard);
  photos.forEach((photo, index) => {
    const trigger = element("button", "image-preview");
    trigger.type = "button";
    trigger.setAttribute("aria-label", `${copy.viewer.open}: ${photo.alt}`);
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.append(createImage(photo));
    trigger.addEventListener("click", () => viewer.open(index, trigger));
    if (index === 0) cards[0]!.prepend(trigger);
    else cards[2]!.append(trigger);
  });
  grid.append(...cards);
  main.append(intro, grid, viewer.dialog);
  return main;
}
