import { element } from "../dom";
import type { PostCategory } from "../posts/registry";

export function createPostCategory(category: PostCategory, label: string, articles: readonly HTMLElement[]): HTMLElement {
  const section = element("section", "post-category");
  section.id = category;
  const heading = element("h2", "", label);
  heading.id = `${category}-title`;
  section.setAttribute("aria-labelledby", heading.id);
  const list = element("div", "post-list");
  list.append(...articles);
  section.append(heading, list);
  return section;
}
