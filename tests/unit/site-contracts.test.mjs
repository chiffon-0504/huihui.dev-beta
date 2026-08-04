import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { htmlDocuments, primaryRoutes } from "../support/routes.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const localeFiles = {
  zh: "js/locales/zh.js",
  en: "js/locales/en.js",
  ja: "js/locales/ja.js",
};

async function exists(relativePath) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function flattenKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;

    if (child && typeof child === "object" && !Array.isArray(child)) {
      return flattenKeys(child, nextPrefix);
    }

    return [nextPrefix];
  });
}

function resolveLocalReference(htmlFile, reference) {
  const cleanReference = reference.split(/[?#]/, 1)[0];

  if (!cleanReference) return null;
  if (/^(?:https?:|mailto:|data:|javascript:|#)/i.test(cleanReference)) {
    return null;
  }

  let target = cleanReference.startsWith("/")
    ? cleanReference.slice(1)
    : path.posix.normalize(
        path.posix.join(path.posix.dirname(htmlFile), cleanReference),
      );

  if (!target || target.endsWith("/")) target += "index.html";
  return target;
}

function getHtmlReferences(html) {
  return [
    ...html.matchAll(/(?:^|\s)(?:action|href|src)="([^"]+)"/g),
  ].map((match) => match[1]);
}

function getMarkdownSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `## ${heading}`);
  const end = lines.findIndex(
    (line, index) => index > start && line.startsWith("## "),
  );

  expect(start, `README section: ${heading}`).toBeGreaterThanOrEqual(0);
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

function parseRedirects(source) {
  return new Map(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const [from, to] = line.split(/\s+/);
        return [from, to];
      }),
  );
}

describe("static site contracts", () => {
  test("all primary locale routes exist", async () => {
    for (const route of primaryRoutes) {
      expect(await exists(route.file), route.file).toBe(true);
    }
  });

  test("all HTML documents use expected languages and unique IDs", async () => {
    for (const document of htmlDocuments) {
      const html = await readFile(path.join(root, document.file), "utf8");
      const lang = html.match(/<html[^>]*\blang="([^"]+)"/i)?.[1];
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

      expect(lang, document.file).toBe(document.lang);
      expect(new Set(ids).size, document.file).toBe(ids.length);
    }
  });

  test("all local HTML references resolve", async () => {
    for (const document of htmlDocuments) {
      const html = await readFile(path.join(root, document.file), "utf8");
      const references = getHtmlReferences(html);

      for (const reference of references) {
        const target = resolveLocalReference(document.file, reference);
        if (!target) continue;

        expect(
          await exists(target),
          `${document.file}: ${reference}`,
        ).toBe(true);
      }
    }
  });

  test("reference scanning includes form actions and excludes data-action", () => {
    const html = [
      '<form action="/contact/" method="POST">',
      '<div data-action="contact"></div>',
      '<script src="/js/contact.js"></script>',
      "</form>",
    ].join("");

    expect(getHtmlReferences(html)).toEqual([
      "/contact/",
      "/js/contact.js",
    ]);
  });

  test("all redirect destinations resolve", async () => {
    const redirects = await readFile(path.join(root, "_redirects"), "utf8");

    for (const line of redirects.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const [, destination, statusCode] = trimmed.split(/\s+/);
      const target = resolveLocalReference("index.html", destination);

      expect(statusCode, line).toMatch(/^30[1278]$/);
      expect(target, line).not.toBeNull();
      expect(await exists(target), line).toBe(true);
    }
  });

  test("README documents current milestone routes and legacy redirects", async () => {
    const readme = await readFile(path.join(root, "README.md"), "utf8");
    const redirects = parseRedirects(
      await readFile(path.join(root, "_redirects"), "utf8"),
    );
    const features = getMarkdownSection(readme, "Features");
    const projectStructure = getMarkdownSection(readme, "Project Structure");
    const structureTree = projectStructure.match(
      /```text\r?\n([\s\S]*?)```/,
    )?.[1];
    const currentRoutes = [
      "/milestones/",
      "/en/milestones/",
      "/ja/milestones/",
    ];
    const legacyRoutes = ["/posts/", "/en/posts/", "/ja/posts/"];

    expect(structureTree, "README Project Structure tree").toBeDefined();
    for (const route of currentRoutes) {
      expect(features, route).toContain(`\`${route}\``);
    }
    for (const route of legacyRoutes) {
      expect(features, route).not.toContain(`\`${route}\``);
    }
    expect(structureTree).toMatch(/^\|-- milestones\/$/m);
    expect(structureTree).not.toMatch(/^\|-- posts\/$/m);
    expect(projectStructure).toContain(
      "| `milestones/` | Milestones listing and article-facing UI structure |",
    );
    expect(projectStructure).not.toMatch(/^\| `posts\/` \|/m);

    const documentedLegacyLine = readme
      .split(/\r?\n/)
      .find((line) => legacyRoutes.every((route) => line.includes(route)));
    expect(documentedLegacyLine).toMatch(
      /legacy redirects?.*backward compatibility/i,
    );

    let currentSection = "";
    for (const line of readme.split(/\r?\n/)) {
      const heading = line.match(/^## (.+)$/)?.[1];
      if (heading) currentSection = heading;

      if (
        legacyRoutes.some((route) => line.includes(route)) &&
        currentSection !== "Recent Improvements"
      ) {
        expect(line).toMatch(
          /\b(?:legacy|redirect|backward compatibility|deprecated)\b/i,
        );
      }
    }

    const expectedLegacyRedirects = new Map([
      ["/posts/", "/milestones/"],
      ["/en/posts/", "/en/milestones/"],
      ["/ja/posts/", "/ja/milestones/"],
    ]);
    for (const [from, to] of expectedLegacyRedirects) {
      expect(documentedLegacyLine, from).toContain(`\`${from}\``);
      expect(documentedLegacyLine, to).toContain(`\`${to}\``);
      expect(redirects.get(from), from).toBe(to);
    }
  });

  test("locale dictionaries have identical key structures", async () => {
    const context = { window: {} };
    vm.createContext(context);

    for (const relativePath of Object.values(localeFiles)) {
      const source = await readFile(path.join(root, relativePath), "utf8");
      vm.runInContext(source, context, { filename: relativePath });
    }

    const dictionaries = context.window.HUIHUI_I18N;
    const expectedKeys = flattenKeys(dictionaries.zh).sort();

    expect(flattenKeys(dictionaries.en).sort()).toEqual(expectedKeys);
    expect(flattenKeys(dictionaries.ja).sort()).toEqual(expectedKeys);
  });
});
