import { element, link } from "../dom";
import type { Locale } from "../locales";
import type { PostContent } from "../locales/types";
import { postHref, type Post } from "../posts/registry";

export function createPostCard(post: Post, copy: PostContent, locale: Locale): HTMLElement {
  const article = element("article", "post-card");
  article.id = post.id;
  const title = element("h3", "");
  title.id = `${post.id}-title`;
  title.append(link(copy.title, postHref(locale, post.id), "post-title-link"));
  article.setAttribute("aria-labelledby", title.id);
  article.append(title);
  if (post.published) {
    const date = element("time", "post-date", new Intl.DateTimeFormat(locale, {
      year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    }).format(new Date(`${post.published}T00:00:00Z`)));
    date.dateTime = post.published;
    article.append(date);
  }
  article.append(element("p", "post-excerpt", copy.excerpt));
  return article;
}
