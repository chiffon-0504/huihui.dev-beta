import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  primaryRouteGroups,
  primaryRoutes,
  standaloneDocuments,
} from "../support/routes.mjs";
import {
  expectedHreflangs,
  getExpectedSeoMetadata,
  hreflangByLocale,
  productionOrigin,
} from "../support/seo-metadata.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const expectedPrimaryRouteUrls = [
  "/",
  "/en/",
  "/ja/",
  "/about/",
  "/en/about/",
  "/ja/about/",
  "/works/",
  "/en/works/",
  "/ja/works/",
  "/contact/",
  "/en/contact/",
  "/ja/contact/",
  "/milestones/",
  "/en/milestones/",
  "/ja/milestones/",
  "/status/",
  "/en/status/",
  "/ja/status/",
  "/tools/tier-maker/",
  "/en/tools/tier-maker/",
  "/ja/tools/tier-maker/",
];
const expectedTitles = {
  "/": "huihui.dev",
  "/en/": "huihui.dev",
  "/ja/": "huihui.dev",
  "/about/": "關於我 | huihui.dev",
  "/en/about/": "About | huihui.dev",
  "/ja/about/": "私について | huihui.dev",
  "/works/": "作品 | huihui.dev",
  "/en/works/": "Works | huihui.dev",
  "/ja/works/": "作品 | huihui.dev",
  "/contact/": "聯絡 | huihui.dev",
  "/en/contact/": "Contact | huihui.dev",
  "/ja/contact/": "連絡先 | huihui.dev",
  "/milestones/": "里程碑 | huihui.dev",
  "/en/milestones/": "Milestones | huihui.dev",
  "/ja/milestones/": "マイルストーン | huihui.dev",
  "/status/": "系統狀態 | huihui.dev",
  "/en/status/": "System Status | huihui.dev",
  "/ja/status/": "システム状況 | huihui.dev",
  "/tools/tier-maker/": "分級表製作器 | huihui.dev",
  "/en/tools/tier-maker/": "Tier Maker | huihui.dev",
  "/ja/tools/tier-maker/": "ティアメーカー | huihui.dev",
};
const expectedHomeDescriptions = {
  "/":
    "huihui.dev 是一個介紹開發專案、里程碑與個人興趣的個人網站與作品集。",
  "/en/":
    "huihui.dev is a personal website and portfolio featuring development projects, milestones, and personal interests.",
  "/ja/":
    "huihui.devは、開発プロジェクト、マイルストーン、個人の興味・関心を紹介する個人サイト兼ポートフォリオです。",
  "/status/":
    "查看 huihui.dev Website、API 與聯絡服務的目前系統狀態。",
  "/en/status/":
    "View the current health of the huihui.dev Website, API, and Contact Service.",
  "/ja/status/":
    "huihui.dev の Website、API、Contact Service の現在の稼働状況を確認できます。",
};

function getTags(source, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

function getAttributes(tag) {
  const attributes = {};
  const pattern = /\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }

  return attributes;
}

function hasRel(attributes, value) {
  return attributes.rel?.toLowerCase().split(/\s+/).includes(value) ?? false;
}

function getMetadataLinks(source) {
  return getTags(source, "link")
    .map((tag) => ({ tag, attributes: getAttributes(tag) }))
    .filter(
      ({ attributes }) =>
        hasRel(attributes, "canonical") ||
        (hasRel(attributes, "alternate") && attributes.hreflang),
    );
}

function getHead(html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  expect(head, "document must have a head element").toBeDefined();
  return head;
}

function expectSafeProductionUrl(href, file) {
  expect(() => new URL(href), `${file}: ${href}`).not.toThrow();

  const url = new URL(href);
  expect(url.protocol, `${file}: ${href}`).toBe("https:");
  expect(url.origin, `${file}: ${href}`).toBe(productionOrigin);
  expect(url.hostname, `${file}: ${href}`).toBe("huihui.dev");
  expect(url.search, `${file}: ${href}`).toBe("");
  expect(url.hash, `${file}: ${href}`).toBe("");
  expect(url.pathname, `${file}: ${href}`).not.toContain("index.html");
  expect(url.pathname.endsWith("/"), `${file}: ${href}`).toBe(true);
  expect(href, `${file}: ${href}`).not.toMatch(
    /(?:beta\.huihui\.dev|pages\.dev|localhost|127\.0\.0\.1)/i,
  );
}

async function readRouteHtml(route) {
  return readFile(path.join(root, route.file), "utf8");
}

describe("canonical and hreflang static contracts", () => {
  test("covers exactly the 21 primary locale routes", async () => {
    const redirects = await readFile(path.join(root, "_redirects"), "utf8");
    const redirectSources = redirects
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/, 1)[0])
      .filter(Boolean);

    expect(primaryRouteGroups).toHaveLength(7);
    expect(primaryRoutes).toHaveLength(21);
    expect(primaryRoutes.map((route) => route.url).sort()).toEqual(
      [...expectedPrimaryRouteUrls].sort(),
    );
    expect(primaryRoutes.map((route) => route.file)).not.toContain("404.html");
    expect(primaryRoutes.map((route) => route.file)).not.toContain(
      "114514/index.html",
    );
    expect(primaryRoutes.some((route) => route.url.includes("/posts/"))).toBe(
      false,
    );
    expect(
      primaryRoutes.some((route) => redirectSources.includes(route.url)),
    ).toBe(false);
    expect(standaloneDocuments.map((document) => document.file)).toEqual([
      "114514/index.html",
      "404.html",
    ]);
  });

  test("preserves each primary document title, localized Home description, and language", async () => {
    for (const route of primaryRoutes) {
      const html = await readRouteHtml(route);
      const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(
        (match) => match[1],
      );
      const descriptions = getTags(html, "meta")
        .map(getAttributes)
        .filter((attributes) => attributes.name?.toLowerCase() === "description");
      const headDescriptions = getTags(getHead(html), "meta")
        .map(getAttributes)
        .filter((attributes) => attributes.name?.toLowerCase() === "description");
      const lang = html.match(/<html[^>]*\blang="([^"]+)"/i)?.[1];
      const expectedDescription = expectedHomeDescriptions[route.url];

      expect(titles, route.file).toEqual([expectedTitles[route.url]]);
      if (expectedDescription) {
        expect(descriptions, route.file).toEqual([
          { name: "description", content: expectedDescription },
        ]);
        expect(
          headDescriptions,
          `${route.file}: description must be in head`,
        ).toEqual(descriptions);
      }
      expect(lang, route.file).toBe(route.lang);
    }
  });

  test("enforces exact canonical and alternate metadata in every static head", async () => {
    for (const route of primaryRoutes) {
      const html = await readRouteHtml(route);
      const allMetadataLinks = getMetadataLinks(html);
      const headMetadataLinks = getMetadataLinks(getHead(html));
      const canonicalLinks = headMetadataLinks.filter(({ attributes }) =>
        hasRel(attributes, "canonical"),
      );
      const alternateLinks = headMetadataLinks.filter(({ attributes }) =>
        hasRel(attributes, "alternate"),
      );
      const expected = getExpectedSeoMetadata(route);

      expect(allMetadataLinks, `${route.file}: metadata must be in head`).toEqual(
        headMetadataLinks,
      );
      expect(canonicalLinks, route.file).toHaveLength(1);
      expect(alternateLinks, route.file).toHaveLength(4);
      expect(
        headMetadataLinks.map(({ attributes }) =>
          hasRel(attributes, "canonical")
            ? "canonical"
            : attributes.hreflang,
        ),
        `${route.file}: metadata order`,
      ).toEqual(["canonical", ...expectedHreflangs]);

      const canonicalHref = canonicalLinks[0].attributes.href;
      const actualHreflangs = alternateLinks.map(
        ({ attributes }) => attributes.hreflang,
      );
      const alternateMap = Object.fromEntries(
        alternateLinks.map(({ attributes }) => [
          attributes.hreflang,
          attributes.href,
        ]),
      );
      const expectedAlternateMap = Object.fromEntries(
        expected.alternates.map(({ hreflang, href }) => [hreflang, href]),
      );

      expect(canonicalHref, route.file).toBe(expected.canonical);
      expect(actualHreflangs.sort(), route.file).toEqual(
        [...expectedHreflangs].sort(),
      );
      expect(
        new Set(actualHreflangs).size,
        `${route.file}: duplicate hreflang`,
      ).toBe(4);
      expect(alternateMap, route.file).toEqual(expectedAlternateMap);
      expect(alternateMap[hreflangByLocale[route.locale]], route.file).toBe(
        expected.canonical,
      );
      expect(alternateMap["x-default"], route.file).toBe(
        expectedAlternateMap["zh-Hant"],
      );

      for (const href of [canonicalHref, ...Object.values(alternateMap)]) {
        expectSafeProductionUrl(href, route.file);
      }
    }
  });

  test("keeps every three-locale route cluster fully reciprocal", async () => {
    for (const routeGroup of primaryRouteGroups) {
      const clusterRoutes = primaryRoutes.filter(
        (route) => route.routeKey === routeGroup.routeKey,
      );
      const alternateClusters = [];

      expect(clusterRoutes, routeGroup.routeKey).toHaveLength(3);

      for (const route of clusterRoutes) {
        const html = await readRouteHtml(route);
        const alternates = getMetadataLinks(getHead(html))
          .filter(({ attributes }) => hasRel(attributes, "alternate"))
          .map(({ attributes }) => [attributes.hreflang, attributes.href]);

        alternateClusters.push(alternates);
      }

      expect(alternateClusters[1], routeGroup.routeKey).toEqual(
        alternateClusters[0],
      );
      expect(alternateClusters[2], routeGroup.routeKey).toEqual(
        alternateClusters[0],
      );
    }
  });
});
