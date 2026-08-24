import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const helperNames = [
  "shouldReduceCodeRevealMotion",
  "setCodeRevealProgress",
];

let codeBlocksSource;
let aboutLineNumbersSource;

beforeAll(async () => {
  [codeBlocksSource, aboutLineNumbersSource] = await Promise.all([
    readFile(path.join(root, "js/code-blocks.js"), "utf8"),
    readFile(path.join(root, "js/about-code-line-numbers.js"), "utf8"),
  ]);
});

describe("About code reveal helper ownership", () => {
  test("keeps one canonical declaration for each reveal helper in code-blocks.js", () => {
    for (const helperName of helperNames) {
      const declaration = new RegExp(`function\\s+${helperName}\\s*\\(`, "g");

      expect(codeBlocksSource.match(declaration)).toHaveLength(1);
      expect(aboutLineNumbersSource).not.toMatch(declaration);
    }
  });

  test("the canonical progress helper reveals the custom About gutter", () => {
    expect(codeBlocksSource).toContain(
      'wrapper.querySelector(".custom-line-numbers")',
    );
    expect(codeBlocksSource).toContain(
      "[code, lineNumbers, customLineNumbers].forEach",
    );
  });

  test("requests a reveal update after rebuilding the custom gutter", () => {
    expect(aboutLineNumbersSource).toMatch(
      /pre\.before\(gutter\);[\s\S]*if \(typeof requestScrollRevealUpdate === "function"\) \{\s*requestScrollRevealUpdate\(\);/,
    );
  });
});
