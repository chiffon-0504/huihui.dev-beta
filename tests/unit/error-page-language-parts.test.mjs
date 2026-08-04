import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const allowedLanguages = ["zh-Hant", "en", "ja"];
const pages = [
  {
    file: "404.html",
    heading: "404",
    paragraphs: [
      { lang: null, text: "這個頁面不存在。" },
      { lang: "en", text: "This page does not exist." },
      { lang: "ja", text: "このページは存在しません。" },
    ],
    bodyText:
      "404 這個頁面不存在。 This page does not exist. このページは存在しません。 回首頁 / Home / ホーム",
  },
  {
    file: "114514/index.html",
    heading: "114514",
    paragraphs: [
      { lang: null, text: "這個頁面太過惡臭了。" },
      { lang: "en", text: "This page is far too foul." },
      { lang: "ja", text: "このページはあまりにも臭すぎます。" },
    ],
    bodyText:
      "114514 這個頁面太過惡臭了。 This page is far too foul. このページはあまりにも臭すぎます。 回首頁 / Home / ホーム",
  },
];

const normalizeText = (value) => value.replace(/\s+/g, " ").trim();

function getAttribute(attributes, name) {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return match ? (match[1] ?? match[2]) : null;
}

function getElements(source, tagName) {
  const pattern = new RegExp(
    `<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`,
    "gi",
  );
  return [...source.matchAll(pattern)].map((match) => ({
    attributes: match[1],
    html: match[2],
    text: normalizeText(match[2].replace(/<[^>]+>/g, "")),
  }));
}

function getLanguageValues(source) {
  const assignments = source.match(/\blang\s*=/gi) ?? [];
  const values = [
    ...source.matchAll(/\blang\s*=\s*(?:"([^"]*)"|'([^']*)')/gi),
  ].map((match) => match[1] ?? match[2]);

  expect(values).toHaveLength(assignments.length);
  return values;
}

describe("error-page language-of-parts contracts", () => {
  for (const pageContract of pages) {
    test(`${pageContract.file} preserves text and marks language parts`, async () => {
      const source = await readFile(path.join(root, pageContract.file), "utf8");
      const htmlAttributes = source.match(/<html\b([^>]*)>/i)?.[1];
      const headings = getElements(source, "h1");
      const paragraphs = getElements(source, "p");
      const links = getElements(source, "a");

      expect(htmlAttributes).toBeDefined();
      expect(getAttribute(htmlAttributes, "lang")).toBe("zh-Hant");

      expect(headings).toHaveLength(1);
      expect(headings[0].text).toBe(pageContract.heading);
      expect(getAttribute(headings[0].attributes, "id")).toBe("errorTitle");
      expect(getAttribute(headings[0].attributes, "lang")).toBeNull();

      expect(paragraphs).toHaveLength(pageContract.paragraphs.length);
      expect(
        paragraphs.map((paragraph) => ({
          lang: getAttribute(paragraph.attributes, "lang"),
          text: paragraph.text,
        })),
      ).toEqual(pageContract.paragraphs);

      expect(links).toHaveLength(1);
      expect(getAttribute(links[0].attributes, "href")).toBe("/");
      expect(links[0].text).toBe("回首頁 / Home / ホーム");
      expect(normalizeText(links[0].html)).toBe(
        '回首頁 / <span lang="en">Home</span> / <span lang="ja">ホーム</span>',
      );
      expect(
        getElements(links[0].html, "span").map((span) => ({
          lang: getAttribute(span.attributes, "lang"),
          text: span.text,
        })),
      ).toEqual([
        { lang: "en", text: "Home" },
        { lang: "ja", text: "ホーム" },
      ]);

      expect(
        normalizeText(
          [
            headings[0].text,
            ...paragraphs.map((paragraph) => paragraph.text),
            links[0].text,
          ].join(" "),
        ),
      ).toBe(pageContract.bodyText);

      const languageValues = getLanguageValues(source);
      expect(languageValues.every((lang) => lang.trim().length > 0)).toBe(true);
      expect(
        languageValues.every((lang) => allowedLanguages.includes(lang)),
      ).toBe(true);
    });
  }
});
