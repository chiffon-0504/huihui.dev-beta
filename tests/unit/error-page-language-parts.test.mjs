import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const allowedLanguages = ["zh-Hant", "en", "ja"];
const pages = [
  {
    file: "404.html",
    heading: "404",
    paragraphs: [
      { selector: ".error-card > p:nth-of-type(1)", expectedLang: "zh-Hant", expectedText: "這個頁面不存在。" },
      { selector: ".error-card > p:nth-of-type(2)", expectedLang: "en", expectedText: "This page does not exist." },
      { selector: ".error-card > p:nth-of-type(3)", expectedLang: "ja", expectedText: "このページは存在しません。" },
    ],
    bodyText: "404 這個頁面不存在。 This page does not exist. このページは存在しません。 回首頁 / Home / ホーム",
  },
  {
    file: "114514/index.html",
    heading: "114514",
    paragraphs: [
      { selector: ".error-card > p:nth-of-type(1)", expectedLang: "zh-Hant", expectedText: "這個頁面太過惡臭了。" },
      { selector: ".error-card > p:nth-of-type(2)", expectedLang: "en", expectedText: "This page is far too foul." },
      { selector: ".error-card > p:nth-of-type(3)", expectedLang: "ja", expectedText: "このページはあまりにも臭すぎます。" },
    ],
    bodyText: "114514 這個頁面太過惡臭了。 This page is far too foul. このページはあまりにも臭すぎます。 回首頁 / Home / ホーム",
  },
];

const normalizeText = (value) => value.replace(/\s+/g, " ").trim();

let browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

async function inspectHtml(file) {
  const source = await readFile(path.join(root, file), "utf8");
  const page = await browser.newPage();
  await page.setContent(source);
  return page;
}

async function effectiveLanguage(locator) {
  return locator.evaluate((element) =>
    element.closest("[lang]")?.getAttribute("lang"),
  );
}

describe("error-page language-of-parts contracts", () => {
  for (const pageContract of pages) {
    test(`${pageContract.file} preserves text and marks language parts`, async () => {
      const page = await inspectHtml(pageContract.file);

      expect(await page.locator("html").getAttribute("lang")).toBe("zh-Hant");
      expect(await page.locator("h1").textContent()).toBe(pageContract.heading);
      expect(await page.locator("body").evaluate((body) => body.innerText.replace(/\s+/g, " ").trim())).toBe(
        pageContract.bodyText,
      );
      expect(await page.locator(".error-card").evaluate((card) =>
        [...card.children].map((element) => element.tagName.toLowerCase()),
      )).toEqual(["h1", "p", "p", "p", "a"]);

      for (const paragraph of pageContract.paragraphs) {
        const locator = page.locator(paragraph.selector);
        expect(normalizeText(await locator.textContent())).toBe(paragraph.expectedText);
        expect(await effectiveLanguage(locator)).toBe(paragraph.expectedLang);
        if (paragraph.expectedLang !== "zh-Hant") {
          expect(await locator.getAttribute("lang")).toBe(paragraph.expectedLang);
          expect(await locator.evaluate((element) => element.lang)).toBe(paragraph.expectedLang);
        }
      }

      const homeLink = page.locator("a.error-home-button");
      expect(await homeLink.getAttribute("href")).toBe("/");
      expect(normalizeText(await homeLink.textContent())).toBe("回首頁 / Home / ホーム");
      expect(await effectiveLanguage(homeLink)).toBe("zh-Hant");
      for (const languagePart of [
        { selector: 'span[lang="en"]', lang: "en", text: "Home" },
        { selector: 'span[lang="ja"]', lang: "ja", text: "ホーム" },
      ]) {
        const locator = homeLink.locator(languagePart.selector);
        expect(await locator.textContent()).toBe(languagePart.text);
        expect(await effectiveLanguage(locator)).toBe(languagePart.lang);
        expect(await locator.evaluate((element) => element.lang)).toBe(languagePart.lang);
      }

      expect(await page.locator("h1").getAttribute("lang")).toBeNull();
      expect(await page.locator("[lang]").evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("lang")),
      )).toEqual(expect.arrayContaining(allowedLanguages));
      expect(await page.locator("[lang]").evaluateAll((elements) =>
        elements.every((element) => ["zh-Hant", "en", "ja"].includes(element.getAttribute("lang"))),
      )).toBe(true);
      expect(await page.locator("[lang]").evaluateAll((elements) =>
        elements.every((element) => element.getAttribute("lang").trim().length > 0),
      )).toBe(true);

      await page.close();
    });
  }
});
