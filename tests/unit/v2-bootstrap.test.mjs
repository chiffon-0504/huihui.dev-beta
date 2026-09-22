import { Script, createContext } from "node:vm";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { build } from "vite";
import config from "../../vite.v2.config.mjs";
import { THEME_STORAGE_KEY } from "../../v2/src/theme/preference.ts";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales/index.ts";
import { fileURLToPath } from "node:url";
import { assertPerformance, measurePerformance, readFiles } from "../../v2/tools/performance.mjs";

let output;
let bootstrap;
let source;

beforeAll(async () => {
  // Exercise the real HTML/plugin pipeline entirely in memory; never replace dist.
  const result = await build({
    ...config,
    configFile: false,
    logLevel: "silent",
    build: { ...config.build, write: false, emptyOutDir: false },
  });
  output = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
  const scripts = output.filter((entry) => /^assets\/theme-bootstrap-[a-f0-9]+\.js$/.test(entry.fileName));
  expect(scripts).toHaveLength(1);
  bootstrap = scripts[0];
  expect(bootstrap.type).toBe("asset");
  source = String(bootstrap.source);
}, 30_000);

describe("v2 initial theme build contract", () => {
  test("private Jev has no public entry point or bundled credentials", () => {
    const html = String(output.find(entry => entry.fileName === "tools/jev/index.html")?.source);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain(`<script src="/${bootstrap.fileName}"></script>`);
    const privateScripts = output.filter(entry => /^assets\/jev-.*\.js$/.test(entry.fileName));
    expect(privateScripts).toHaveLength(1);
    expect(String(privateScripts[0].source)).not.toMatch(/TYPESAFE_JEV_API_KEY|api\.typesafe\.ai|cloudflareaccess\.com|synthetic-jev-secret/);
    for (const entry of output.filter(entry => entry.fileName.endsWith(".html") && entry.fileName !== "tools/jev/index.html")) {
      expect(String(entry.source)).not.toContain("/tools/jev");
      expect(String(entry.source)).not.toMatch(/assets\/jev-/);
    }
  });
  test("the production output and copied public files stay within performance budgets", async () => {
    const publicFiles = await readFiles(fileURLToPath(new URL("../../v2/public/", import.meta.url)));
    assertPerformance(measurePerformance([...output, ...publicFiles]));
  });

  test.each(["index.html", "en/index.html", "ja/index.html", "about/index.html", "en/about/index.html", "ja/about/index.html", "works/index.html", "en/works/index.html", "ja/works/index.html", "posts/index.html", "en/posts/index.html", "ja/posts/index.html"])("%s blocks parsing with an external classic bootstrap before styles and app", (entry) => {
    const html = String(output.find((asset) => asset.fileName === entry)?.source);
    const tag = `<script src="/${bootstrap.fileName}"></script>`;
    expect(html).toContain(tag);
    const position = html.indexOf(tag);
    expect(position).toBeGreaterThan(html.indexOf("<head>"));
    expect(position).toBeLessThan(html.indexOf("</head>"));
    expect(position).toBeLessThan(html.indexOf('type="module"'));
    expect(position).toBeLessThan(html.indexOf('rel="stylesheet"'));
    // The exact bootstrap tag above excludes module, async, defer and inline code.
    // Preserve the same CSP-safe external-only contract for every generated script.
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      expect(script[1]).toMatch(/\bsrc="\/[^"\s]+"/);
      expect(script[2].trim()).toBe("");
    }
  });

  test("emits exactly Home, About, Works and Posts in three locales with translated static metadata", () => {
    const documents = output.filter((entry) => entry.fileName.endsWith(".html"));
    expect(documents).toHaveLength(14);
    const content = documents.filter((entry) => !["404.html", "tools/jev/index.html"].includes(entry.fileName));
    expect(content).toHaveLength(12);
    expect(content.map((entry) => entry.fileName).sort())
      .toEqual(["about/index.html", "en/about/index.html", "en/index.html", "en/posts/index.html", "en/works/index.html", "index.html", "ja/about/index.html", "ja/index.html", "ja/posts/index.html", "ja/works/index.html", "posts/index.html", "works/index.html"]);
    for (const [locale, page] of supportedLocales.flatMap((locale) => ["about", "works", "posts"].map((page) => [locale, page]))) {
      const route = localeHref(locale, "", page);
      const html = String(output.find((entry) => entry.fileName === `${route.slice(1)}index.html`)?.source);
      const copy = getContent(locale)[`${page}Page`];
      expect(html).toContain(`<html lang="${locale}">`);
      expect(html).toContain(`<title>${copy.title} | huihui.dev</title>`);
      expect(html).toContain(copy.noScript);
      expect(html).toContain(`<meta name="description" content="${copy.description}">`);
      expect(html).not.toMatch(/\{\{|(?:src|href)="(?:\/v2\/|\/vendor\/)|src="https?:\/\//g);
    }
  });

  test("reserved error URLs rewrite only to an absent static target", async () => {
    const rules = await readFile(new URL("../../v2/public/_redirects", import.meta.url), "utf8");
    expect(rules.trim().split(/\r?\n/)).toEqual([
      "/404.html /__v2-not-found__/ 200",
      "/404 /__v2-not-found__/ 200",
    ]);
    const publicFiles = await readdir(new URL("../../v2/public/", import.meta.url), { recursive: true });
    const files = [...output.map((entry) => entry.fileName), ...publicFiles];
    expect(files.some((file) => file.replaceAll("\\", "/").startsWith("__v2-not-found__"))).toBe(false);
  });

  test("the single shared error document is script-free with three native escape links", () => {
    const errors = output.filter((entry) => entry.fileName === "404.html");
    expect(errors).toHaveLength(1);
    const html = String(errors[0].source);
    expect(html).toContain('<main class="not-found">');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("<h1>404</h1>");
    expect(html.match(/<h2\b/g)).toHaveLength(3);
    expect([...html.matchAll(/<a href="([^"]+)" hreflang="([^"]+)"/g)].map((match) => match.slice(1)))
      .toEqual([["/", "zh-Hant"], ["/en/", "en"], ["/ja/", "ja"]]);
    expect(html).not.toMatch(/<script\b|<style\b|\bstyle=|\bon\w+=|main\.ts|modulepreload|id="app"|<nav\b|<footer\b|https?:\/\//i);
    const styles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)];
    expect(styles.length).toBeGreaterThan(0);
    for (const [, path] of styles) {
      expect(path).toMatch(/^\/assets\/[\w.-]+\.css$/);
      expect(output.some((entry) => `/${entry.fileName}` === path)).toBe(true);
    }
    const routes = supportedLocales.flatMap((locale) => ["home", "about", "works", "posts"].map((page) => localeHref(locale, "", page)));
    expect(new Set(routes).size).toBe(12);
    expect(routes).not.toContain("/404.html");
  });

  test("the generated bootstrap parses as a classic script without module or dynamic-code execution", () => {
    expect(() => new Script(source)).not.toThrow();
    expect(source).not.toMatch(/\bimport\s*\(|\beval\b|\bFunction\s*\(/);
  });
});

function runBootstrap(saved, time, timeZone, blockedStorage = false) {
  const root = { dataset: {} };
  const getItem = vi.fn(() => saved);
  const setItem = vi.fn(() => { throw new Error("Bootstrap must never write the preference"); });
  const host = {};
  Object.defineProperty(host, "localStorage", {
    get() {
      if (blockedStorage) throw new Error("Storage denied");
      return { getItem, setItem };
    },
  });
  class Clock extends Date { static now() { return Date.parse(time); } }
  function DateTimeFormat(locale, options) {
    return options ? new Intl.DateTimeFormat(locale, options) : { resolvedOptions: () => ({ timeZone }) };
  }
  // No location, network, timer or application DOM APIs are available here.
  // Disable dynamic code generation as an additional unsafe-eval negative control.
  const context = createContext({ window: host, document: { documentElement: root }, Date: Clock, Intl: { DateTimeFormat } }, {
    codeGeneration: { strings: false, wasm: false },
  });
  new Script(source).runInContext(context);
  if (!blockedStorage) expect(getItem).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY);
  expect(setItem).not.toHaveBeenCalled();
  return root.dataset.theme;
}

describe("compiled bootstrap preference and Auto behavior", () => {
  test.each([
    [null, "2026-09-12T02:00:00+08:00", "Asia/Taipei", "dark"],
    [null, "2026-09-12T12:00:00+08:00", "Asia/Taipei", "light"],
    ["auto", "2026-09-12T23:00:00+08:00", "Asia/Taipei", "dark"],
    ["auto", "2026-09-12T12:00:00+08:00", "Asia/Taipei", "light"],
    ["light", "2026-09-12T23:00:00+08:00", "Asia/Taipei", "light"],
    ["dark", "2026-09-12T12:00:00+08:00", "Asia/Taipei", "dark"],
    [null, "2026-09-12T23:00:00Z", "UTC", "light"],
    ["auto", "2026-09-12T23:00:00Z", "Invalid/Zone", "light"],
  ])("stored %s at %s in %s initializes %s without writing storage", (saved, time, timeZone, expected) => {
    expect(runBootstrap(saved, time, timeZone)).toBe(expected);
  });

  test("denied localStorage still initializes Auto safely before rendering", () => {
    expect(runBootstrap(null, "2026-09-12T23:00:00+08:00", "Asia/Taipei", true)).toBe("dark");
  });
});
