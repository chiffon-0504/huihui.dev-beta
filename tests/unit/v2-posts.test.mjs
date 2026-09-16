import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { getContent, localeHref, resolveLocale, resolvePage, supportedLocales } from "../../v2/src/locales/index.ts";
import { postCategories, postHref, posts } from "../../v2/src/posts/registry.ts";

test("the registry has unique stable identities, valid dates and explicit categories", () => {
  expect(new Set(posts.map((post) => post.id)).size).toBe(posts.length);
  expect(postCategories).toEqual(["music", "rhythm-games", "journal"]);
  for (const post of posts) {
    expect(post.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(postCategories).toContain(post.category);
    if (post.published) {
      expect(new Date(`${post.published}T00:00:00Z`).toISOString().slice(0, 10)).toBe(post.published);
    }
  }
  expect(postCategories.map((category) => posts.filter((post) => post.category === category).length)).toEqual([1, 5, 1]);
});

test.each(supportedLocales)("%s has complete categorized copy and native Posts destinations", async (locale) => {
  const route = localeHref(locale, "", "posts");
  for (const path of [route, `${route}index.html`, route.slice(0, -1)]) {
    expect(resolvePage(path)).toBe("posts");
    expect(resolveLocale(path)).toBe(locale);
  }
  const copy = getContent(locale).postsPage;
  expect(Object.keys(copy.categories)).toEqual(postCategories);
  expect(Object.keys(copy.articles)).toEqual(posts.map((post) => post.id));
  const strings = (value) => typeof value === "string" ? [value] : Object.values(value).flatMap(strings);
  for (const text of strings(copy)) {
    expect(text.trim()).not.toBe("");
    expect(text).not.toMatch(/<\/?[a-z][^>]*>/i);
  }
  for (const post of posts) {
    expect(Object.keys(copy.articles[post.id]).sort()).toEqual(["excerpt", "title"]);
    expect(postHref(locale, post.id)).toBe(`${route}#${post.id}`);
  }
  for (const category of postCategories) expect(localeHref(locale, `#${category}`, "posts")).toBe(`${route}#${category}`);
  const html = await readFile(new URL(`../../v2${route}index.html`, import.meta.url), "utf8");
  expect(html).toContain(`<html lang="${locale}">`);
  expect(html).toContain("{{posts.title}}");
});

test.each(["/posts-extra/", "/en/posts/extra/", "/ja/posts/index.html/", "/fr/posts/", "/posts/article/", "/en/Posts/"])(
  "unknown path %s does not register as Posts", (path) => {
    expect(resolvePage(path)).toBe("home");
    expect(resolveLocale(path)).toBe("zh-Hant");
  },
);
