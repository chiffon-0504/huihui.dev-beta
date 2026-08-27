import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const homeDocuments = [
  {
    file: "index.html",
    subtitle: "專注於 Web UI、程式碼呈現與嵌入式系統的個人開發空間。",
  },
  {
    file: "en/index.html",
    subtitle:
      "A personal development space focused on Web UI, code rendering, and embedded systems.",
  },
  {
    file: "ja/index.html",
    subtitle:
      "Web UI、コードレンダリング、組み込みシステムに焦点を当てた個人開発スペースです。",
  },
];
const realSectionHeadingIds = [
  "projectUpdateTitle",
  "websiteVersionTitle",
  "techNewsTitle",
  "infrastructureStatusTitle",
];

describe("Home heading semantics", () => {
  test("all locale documents keep one h1 and sequential real section headings", async () => {
    for (const document of homeDocuments) {
      const html = await readFile(path.join(root, document.file), "utf8");
      const h1Elements = [...html.matchAll(/<h1\b[^>]*>/gi)];
      const subtitleElements = [
        ...html.matchAll(
          /<([a-z][\w-]*)\b[^>]*\bdata-i18n="home\.hero\.subtitle"[^>]*>([\s\S]*?)<\/\1>/gi,
        ),
      ];
      const headingLevels = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map(
        (match) => Number(match[1]),
      );

      expect(h1Elements, document.file).toHaveLength(1);
      expect(subtitleElements, document.file).toHaveLength(1);
      expect(subtitleElements[0][1].toLowerCase(), document.file).toBe("p");
      expect(subtitleElements[0][2].trim(), document.file).toBe(
        document.subtitle,
      );
      expect(subtitleElements[0].index, document.file).toBeLessThan(
        html.indexOf('<h2 id="websiteVersionTitle">'),
      );
      expect(headingLevels, document.file).toEqual([1, 2, 2, 2, 2]);
      expect(
        html.indexOf('id="infrastructureStatusTitle"'),
        document.file,
      ).toBeGreaterThan(html.indexOf('id="techNewsCards"'));
      expect(
        headingLevels.every(
          (level, index) =>
            index === 0 || level - headingLevels[index - 1] <= 1,
        ),
        document.file,
      ).toBe(true);

      for (const id of realSectionHeadingIds) {
        expect(html, `${document.file}: ${id}`).toMatch(
          new RegExp(`<h2\\s+id="${id}"(?:\\s|>)`, "i"),
        );
      }
    }
  });
});
