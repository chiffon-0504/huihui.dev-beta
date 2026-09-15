import { element, link } from "../dom";
import { createImage } from "./media";
import type { ImageOptions } from "../media/types";

export interface WorkCard {
  readonly title: string;
  readonly description: string;
  readonly link?: { readonly href: string; readonly label: string };
  readonly image?: ImageOptions;
}

export function createWorkCard(item: WorkCard): HTMLElement {
  const card = element("article", "work-card");
  if (item.image) card.append(createImage(item.image));
  card.append(element("h2", "", item.title), element("p", "work-description", item.description));
  if (item.link) card.append(link(item.link.label, item.link.href, "button"));
  return card;
}
