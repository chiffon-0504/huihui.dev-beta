import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const locales = ["zh", "en", "ja"];

async function createMilestoneContext(pathname = "/milestones/") {
  const container = { innerHTML: "" };
  const context = {
    document: {
      addEventListener() {},
      getElementById(id) {
        return id === "postsList" ? container : null;
      },
    },
    window: {
      location: { pathname },
    },
  };

  vm.createContext(context);

  for (const relativePath of ["js/posts-data.js", "js/posts-render.js"]) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  return { context, container };
}

function readJsonExpression(context, expression) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

describe("milestone localization", () => {
  test("every milestone defines complete zh, en, and ja content", async () => {
    const { context } = await createMilestoneContext();
    const posts = readJsonExpression(context, "HUIHUI_POSTS");
    const ids = posts.map((post) => post.id);

    expect(posts).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);

    for (const post of posts) {
      expect(post.id).toMatch(/^[a-z0-9-]+$/);
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(post.content).sort()).toEqual([...locales].sort());

      for (const locale of locales) {
        expect(post.content[locale].trim(), `${post.id}:${locale}`).not.toBe("");
      }

      expect(Array.isArray(post.images)).toBe(true);
      expect(Array.isArray(post.links)).toBe(true);

      for (const image of post.images) {
        expect(image.id).toMatch(/^[a-z0-9-]+$/);
        expect(Object.keys(image.alt).sort()).toEqual([...locales].sort());
        for (const locale of locales) {
          expect(image.alt[locale].trim(), `${image.id}:${locale}`).not.toBe("");
        }
      }

      if (post.caption) {
        expect(Object.keys(post.caption).sort()).toEqual([...locales].sort());
      }
    }
  });

  test("English and Japanese views use their own bodies without Chinese fallback", async () => {
    const { context } = await createMilestoneContext();
    const sourcePosts = readJsonExpression(context, "HUIHUI_POSTS");
    const englishPosts = readJsonExpression(context, 'getLocalizedPosts("en")');
    const japanesePosts = readJsonExpression(context, 'getLocalizedPosts("ja")');

    for (const [index, sourcePost] of sourcePosts.entries()) {
      expect(englishPosts[index].content).toBe(sourcePost.content.en);
      expect(japanesePosts[index].content).toBe(sourcePost.content.ja);
    }

    const englishBody = englishPosts.map((post) => post.content).join("\n");
    const japaneseBody = japanesePosts.map((post) => post.content).join("\n");

    const chineseOnlyTexts = [
      "初代魔王",
      "3.0 魔王",
      "摘星",
      "從 2021 年開始玩",
      "11.90</span> 到達",
    ];

    for (const chineseOnlyText of chineseOnlyTexts) {
      expect(englishBody).not.toContain(chineseOnlyText);
      expect(japaneseBody).not.toContain(chineseOnlyText);
    }
  });

  test("formats ISO milestone dates for zh-Hant, en, and ja", async () => {
    const { context } = await createMilestoneContext();
    const expected = {
      zh: "2026年6月28日",
      en: "June 28, 2026",
      ja: "2026年6月28日",
    };

    for (const locale of locales) {
      const formatted = vm.runInContext(
        `formatPostDate("2026-06-28", ${JSON.stringify(locale)})`,
        context,
      );
      expect(formatted).toBe(expected[locale]);
    }
  });

  test("keeps milestone IDs, image arrays, and links consistent across locales", async () => {
    const { context } = await createMilestoneContext();
    const localizedPosts = Object.fromEntries(
      locales.map((locale) => [
        locale,
        readJsonExpression(
          context,
          `getLocalizedPosts(${JSON.stringify(locale)})`,
        ),
      ]),
    );
    const sharedShape = (post) => ({
      id: post.id,
      date: post.date,
      images: post.images.map(({ id, src }) => ({ id, src })),
      links: post.links,
    });
    const expectedShape = localizedPosts.zh.map(sharedShape);

    expect(localizedPosts.en.map(sharedShape)).toEqual(expectedShape);
    expect(localizedPosts.ja.map(sharedShape)).toEqual(expectedShape);
  });
});
