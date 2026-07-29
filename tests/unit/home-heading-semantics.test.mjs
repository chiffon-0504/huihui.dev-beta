import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const homeDocuments = ["index.html", "en/index.html", "ja/index.html"];
const realSectionHeadingIds = [
  "projectUpdateTitle",
  "websiteVersionTitle",
  "techNewsTitle",
];

describe("Home heading semantics", () => {
  test("all locale documents keep one h1 and sequential real section headings", async () => {
    for (const document of homeDocuments) {
      const html = await readFile(path.join(root, document), "utf8");
      const h1Elements = [...html.matchAll(/<h1\b[^>]*>/gi)];
      const subtitleElements = [
        ...html.matchAll(
          /<([a-z][\w-]*)\b[^>]*\bdata-i18n="home\.hero\.subtitle"[^>]*>/gi,
        ),
      ];
      const headingLevels = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map(
        (match) => Number(match[1]),
      );

      expect(h1Elements, document).toHaveLength(1);
      expect(subtitleElements, document).toHaveLength(1);
      expect(subtitleElements[0][1].toLowerCase(), document).toBe("p");
      expect(headingLevels, document).toEqual([1, 2, 2, 2]);
      expect(
        headingLevels.every(
          (level, index) =>
            index === 0 || level - headingLevels[index - 1] <= 1,
        ),
        document,
      ).toBe(true);

      for (const id of realSectionHeadingIds) {
        expect(html, `${document}: ${id}`).toMatch(
          new RegExp(`<h2\\s+id="${id}"(?:\\s|>)`, "i"),
        );
      }
    }
  });
});
