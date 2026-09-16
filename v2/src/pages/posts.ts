import { element } from "../dom";
import { getContent, type Locale } from "../locales";
import { postCategories, posts } from "../posts/registry";
import { createPostCard } from "../components/post-card";
import { createPostCategory } from "../components/post-category";

export function createPosts(locale: Locale): HTMLElement {
  const copy = getContent(locale).postsPage;
  const main = element("main", "container posts");
  main.id = "main-content";
  main.tabIndex = -1;
  const intro = element("header", "posts-intro");
  intro.append(element("h1", "", copy.title), element("p", "posts-lead", copy.introduction));
  main.append(intro);
  for (const category of postCategories) {
    const articles = posts.filter((post) => post.category === category)
      .map((post) => createPostCard(post, copy.articles[post.id], locale));
    if (articles.length) main.append(createPostCategory(category, copy.categories[category], articles));
  }
  return main;
}
