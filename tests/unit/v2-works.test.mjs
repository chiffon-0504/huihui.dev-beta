import { readFile } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import { getContent, localeHref, resolveLocale, resolvePage, supportedLocales } from "../../v2/src/locales/index.ts";
import { createImage } from "../../v2/src/components/media.ts";
import { workImages } from "../../v2/src/media/works.ts";

afterEach(() => vi.unstubAllGlobals());

const keys = (value, prefix = "") => Object.entries(value).flatMap(([key, child]) =>
  typeof child === "string" ? [`${prefix}${key}`] : keys(child, `${prefix}${key}.`));

test.each(supportedLocales)("%s Works has complete copy, emitted entry and page-preserving links", async (locale) => {
  const route = localeHref(locale, "", "works");
  for (const path of [route, `${route}index.html`, route.slice(0, -1)]) {
    expect(resolveLocale(path)).toBe(locale);
    expect(resolvePage(path)).toBe("works");
  }
  expect(localeHref(locale, "#main-content", "works")).toBe(`${route}#main-content`);
  const copy = getContent(locale).worksPage;
  expect(keys(copy)).toEqual(keys(getContent("en").worksPage));
  const html = await readFile(new URL(`../../v2${route}index.html`, import.meta.url), "utf8");
  expect(html).toContain(`<html lang="${locale}">`);
  expect(html).toContain("{{works.title}}");
  expect(html).toContain('src="/src/main.ts"');
});

test("the media contract retains CDN URLs, decorative alt, intrinsic dimensions and defaults", () => {
  vi.stubGlobal("document", { createElement: () => ({}) });
  const asset = { src: "https://media.example.test/card.webp", width: 800, height: 600,
    sources: [{ src: "https://media.example.test/card-small.webp", width: 400 }, { src: "https://media.example.test/card.webp", width: 800 }] };
  const image = createImage({ asset, alt: "", sizes: "50vw" });
  expect(image).toMatchObject({ alt: "", width: 800, height: 600, loading: "lazy", decoding: "async",
    src: asset.src, srcset: "https://media.example.test/card-small.webp 400w, https://media.example.test/card.webp 800w", sizes: "50vw" });
  expect(createImage({ asset, alt: "A photograph", sizes: "100vw", loading: "eager", decoding: "sync" }))
    .toMatchObject({ alt: "A photograph", loading: "eager", decoding: "sync" });
});

test.each(Object.entries(workImages))("%s uses bounded local variants and a medium fallback", async (_, asset) => {
  expect(asset.sources.map((source) => source.width)).toEqual([480, 800, 1200]);
  expect(asset.src).toBe(asset.sources[1].src);
  for (const source of asset.sources) {
    const name = source.src.split("/").pop().split("?")[0];
    const bytes = await readFile(new URL(`../../v2/src/media/assets/${name}`, import.meta.url));
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
    expect(bytes.length).toBeLessThan(125_000);
  }
});
