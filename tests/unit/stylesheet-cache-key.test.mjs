import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { primaryRoutes } from "../support/routes.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const productionOrigin = "https://huihui.dev";

function getStylesheetHrefs(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => ({
      href: tag.match(/\bhref="([^"]+)"/i)?.[1],
      rel: tag.match(/\brel="([^"]+)"/i)?.[1],
    }))
    .filter(({ rel }) => rel?.toLowerCase().split(/\s+/).includes("stylesheet"))
    .map(({ href }) => href)
    .filter(Boolean);
}

describe("shared stylesheet cache key", () => {
  test("all primary locale routes use the canonical shared stylesheet URL", async () => {
    for (const route of primaryRoutes) {
      const html = await readFile(path.join(root, route.file), "utf8");
      const documentUrl = new URL(route.url, productionOrigin);
      const sharedStylesheetUrls = getStylesheetHrefs(html)
        .map((href) => new URL(href, documentUrl))
        .filter((url) => url.pathname === "/style.css");

      expect(sharedStylesheetUrls, route.file).toHaveLength(1);
      expect(sharedStylesheetUrls[0].search, route.file).toBe("");
      expect(sharedStylesheetUrls[0].href, route.file).toBe(
        `${productionOrigin}/style.css`,
      );
    }
  });
});
