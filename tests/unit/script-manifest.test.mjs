import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { primaryRoutes } from "../support/routes.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const localOrigin = "https://huihui.dev";
const sharedPrimaryScripts = [
  "/js/layout.js",
  "/js/glass-material.js",
  "/js/mobile-drawer.js",
  "/js/main.js",
  "/js/i18n.js",
];
const localeScripts = {
  zh: "/js/locales/zh.js",
  en: "/js/locales/en.js",
  ja: "/js/locales/ja.js",
};
const localeScriptPaths = Object.values(localeScripts);
const featureScripts = [
  "/js/code-blocks.js",
  "/js/home-cards.js",
  "/js/lightbox.js",
  "/js/posts-data.js",
  "/js/posts-render.js",
  "/js/profile-code.js",
  "/js/about-page.js",
  "/js/about-code-line-numbers.js",
  "/js/contact.js",
];
const prismScripts = [
  "/vendor/prism/components/prism-core.min.js",
  "/vendor/prism/components/prism-python.min.js",
  "/vendor/prism/plugins/line-numbers/prism-line-numbers.min.js",
];
const turnstileScript = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const routeFamilies = [
  {
    name: "Home",
    pages: [
      ["index.html", "/"],
      ["en/index.html", "/en/"],
      ["ja/index.html", "/ja/"],
    ],
    featureScripts: ["/js/home-cards.js"],
  },
  {
    name: "About",
    pages: [
      ["about/index.html", "/about/"],
      ["en/about/index.html", "/en/about/"],
      ["ja/about/index.html", "/ja/about/"],
    ],
    featureScripts: [
      "/js/code-blocks.js",
      "/js/lightbox.js",
      "/js/profile-code.js",
      "/js/about-page.js",
      "/js/about-code-line-numbers.js",
      ...prismScripts,
    ],
  },
  {
    name: "Works",
    pages: [
      ["works/index.html", "/works/"],
      ["en/works/index.html", "/en/works/"],
      ["ja/works/index.html", "/ja/works/"],
    ],
    featureScripts: ["/js/lightbox.js"],
  },
  {
    name: "Milestones",
    pages: [
      ["milestones/index.html", "/milestones/"],
      ["en/milestones/index.html", "/en/milestones/"],
      ["ja/milestones/index.html", "/ja/milestones/"],
    ],
    featureScripts: [
      "/js/lightbox.js",
      "/js/posts-data.js",
      "/js/posts-render.js",
    ],
  },
  {
    name: "Contact",
    pages: [
      ["contact/index.html", "/contact/"],
      ["en/contact/index.html", "/en/contact/"],
      ["ja/contact/index.html", "/ja/contact/"],
    ],
    featureScripts: ["/js/contact.js", turnstileScript],
  },
];

function getAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? null;
}

function canonicalizeScript(src, route) {
  const url = new URL(src, `${localOrigin}${route}`);
  return url.origin === localOrigin ? url.pathname : url.href;
}

async function getScripts(relativePath, route) {
  const html = await readFile(path.join(root, relativePath), "utf8");
  const tags = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);

  return tags
    .map((tag) => getAttribute(tag, "src"))
    .filter(Boolean)
    .map((src) => canonicalizeScript(src, route));
}

function getRouteLocale(route) {
  if (route.startsWith("/en/")) return "en";
  if (route.startsWith("/ja/")) return "ja";
  return "zh";
}

function getExpectedScripts(route, featureScriptsForRoute) {
  return [
    ...sharedPrimaryScripts,
    localeScripts[getRouteLocale(route)],
    ...featureScriptsForRoute,
  ];
}

function normalizeLocaleScript(script) {
  return localeScriptPaths.includes(script) ? "/js/locales/{locale}.js" : script;
}

function expectBefore(scripts, dependency, consumer, relativePath) {
  expect(scripts.indexOf(dependency), `${relativePath}: ${dependency}`).toBeGreaterThanOrEqual(0);
  expect(scripts.indexOf(consumer), `${relativePath}: ${consumer}`).toBeGreaterThanOrEqual(0);
  expect(scripts.indexOf(dependency), relativePath).toBeLessThan(
    scripts.indexOf(consumer),
  );
}

describe("route-specific JavaScript manifests", () => {
  for (const family of routeFamilies) {
    test(`${family.name} has one exact feature manifest with locale parity`, async () => {
      const localizedManifests = [];

      for (const [relativePath, route] of family.pages) {
        const scripts = await getScripts(relativePath, route);
        const expectedScripts = getExpectedScripts(
          route,
          family.featureScripts,
        ).sort();
        const requiredFeatures = new Set(family.featureScripts);

        expect([...scripts].sort(), relativePath).toEqual(expectedScripts);
        for (const featureScript of featureScripts) {
          expect(scripts.includes(featureScript), relativePath).toBe(
            requiredFeatures.has(featureScript),
          );
        }
        localizedManifests.push(scripts.map(normalizeLocaleScript).sort());
      }

      expect(localizedManifests[1]).toEqual(localizedManifests[0]);
      expect(localizedManifests[2]).toEqual(localizedManifests[0]);
    });
  }

  test("all 18 primary routes load exactly one active locale dictionary", async () => {
    expect(primaryRoutes).toHaveLength(18);

    for (const route of primaryRoutes) {
      const scripts = await getScripts(route.file, route.url);
      const loadedLocaleScripts = scripts.filter((script) =>
        localeScriptPaths.includes(script),
      );

      expect(loadedLocaleScripts, route.file).toEqual([
        localeScripts[route.locale],
      ]);

      for (const [locale, localeScript] of Object.entries(localeScripts)) {
        expect(
          scripts.filter((script) => script === localeScript),
          `${route.file}: ${locale}`,
        ).toHaveLength(locale === route.locale ? 1 : 0);
      }
    }
  });

  test("Home has no dead Lightbox markup or trigger attributes", async () => {
    for (const [relativePath] of routeFamilies[0].pages) {
      const html = await readFile(path.join(root, relativePath), "utf8");

      expect(html, relativePath).not.toMatch(
        /\b(?:id=["']lightbox(?:Img|Close)?["']|class=["'][^"']*\bzoomable\b|data-full-src\b)/,
      );
    }
  });

  test("Tier Maker keeps shared infrastructure without primary feature scripts", async () => {
    const pages = [
      ["tools/tier-maker/index.html", "/tools/tier-maker/"],
      ["en/tools/tier-maker/index.html", "/en/tools/tier-maker/"],
      ["ja/tools/tier-maker/index.html", "/ja/tools/tier-maker/"],
    ];
    for (const [relativePath, route] of pages) {
      const expectedScripts = getExpectedScripts(
        route,
        ["/tools/tier-maker/script.js"],
      ).sort();

      expect([...(await getScripts(relativePath, route))].sort(), relativePath).toEqual(
        expectedScripts,
      );
    }
  });

  test("standalone 404 and legacy routes stay script-free", async () => {
    expect(await getScripts("404.html", "/404.html")).toEqual([]);
    expect(await getScripts("114514/index.html", "/114514/")).toEqual([]);
  });

  test("preserves only runtime-required dependency ordering", async () => {
    for (const family of routeFamilies) {
      for (const [relativePath, route] of family.pages) {
        const scripts = await getScripts(relativePath, route);

        expectBefore(
          scripts,
          localeScripts[getRouteLocale(route)],
          "/js/i18n.js",
          relativePath,
        );

        if (family.name === "Home") {
          expectBefore(scripts, "/js/home-cards.js", "/js/main.js", relativePath);
        }
        if (family.name === "About") {
          expectBefore(scripts, prismScripts[0], prismScripts[1], relativePath);
          expectBefore(scripts, prismScripts[1], prismScripts[2], relativePath);
          expectBefore(scripts, prismScripts[2], "/js/code-blocks.js", relativePath);
          expectBefore(scripts, "/js/code-blocks.js", "/js/about-page.js", relativePath);
          expectBefore(scripts, "/js/profile-code.js", "/js/about-page.js", relativePath);
          expectBefore(
            scripts,
            "/js/about-page.js",
            "/js/about-code-line-numbers.js",
            relativePath,
          );
        }
        if (family.name === "Milestones") {
          expectBefore(scripts, "/js/posts-data.js", "/js/posts-render.js", relativePath);
        }
        if (family.name === "Contact") {
          expectBefore(scripts, "/js/main.js", "/js/contact.js", relativePath);
        }
      }
    }
  });
});
