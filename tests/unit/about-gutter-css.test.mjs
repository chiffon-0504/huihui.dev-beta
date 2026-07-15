import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRuleBodies(css, selector) {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, "g");
  return [...css.matchAll(pattern)].map((match) => match[1]);
}

function getDeclaration(ruleBody, property) {
  return ruleBody.match(new RegExp(`${escapeRegExp(property)}\\s*:\\s*([^;]+)`))?.[1].trim();
}

describe("About code gutter CSS", () => {
  test("keeps all gutter geometry in code.css with one selector shape", async () => {
    const codeCss = await readFile(path.join(root, "css", "code.css"), "utf8");
    const preSelector =
      '.about-page .code-block.code-block-with-gutter pre[class*="language-"]';
    const gutterSelector =
      ".about-page .code-block.code-block-with-gutter > .custom-line-numbers";
    const preRules = getRuleBodies(codeCss, preSelector);
    const gutterRules = getRuleBodies(codeCss, gutterSelector).filter((rule) =>
      getDeclaration(rule, "left"),
    );

    expect(preRules).toHaveLength(3);
    expect(preRules.map((rule) => getDeclaration(rule, "padding-left"))).toEqual([
      "4.4rem !important",
      "3.4rem !important",
      "3.15rem !important",
    ]);

    expect(gutterRules).toHaveLength(3);
    expect(gutterRules.map((rule) => getDeclaration(rule, "left"))).toEqual([
      "1.35rem",
      "0.95rem",
      "0.8rem",
    ]);
    expect(gutterRules.map((rule) => getDeclaration(rule, "width"))).toEqual([
      "2.5rem",
      "1.9rem",
      "1.75rem",
    ]);
    expect(codeCss).not.toMatch(/\.about-page \.code-block-with-gutter/);
    expect(codeCss).not.toMatch(/\.about-page \.custom-line-numbers/);
  });

  test("has no competing gutter or important override path in about-code-mobile.css", async () => {
    const mobileCss = await readFile(
      path.join(root, "css", "about-code-mobile.css"),
      "utf8",
    );

    expect(mobileCss).not.toMatch(/code-block-with-gutter|custom-line-numbers/);
    expect(mobileCss).not.toMatch(/padding-left\s*:[^;]+!important/);
  });
});
