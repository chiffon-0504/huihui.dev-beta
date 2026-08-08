import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const contactPages = [
  "contact/index.html",
  "en/contact/index.html",
  "ja/contact/index.html",
];

async function listFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if ([".git", "node_modules", "playwright-report", "test-results"].includes(entry.name)) {
      continue;
    }

    const filePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(filePath, extension)));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(filePath);
    }
  }

  return files;
}

describe("contact module and CSP contracts", () => {
  test("all localized contact pages open Gmail Compose in a new tab", async () => {
    const expectedLink =
      '<a href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=contact%40huihui.dev" target="_blank" rel="noopener noreferrer">contact@huihui.dev</a>';

    for (const relativePath of contactPages) {
      const html = await readFile(path.join(root, relativePath), "utf8");

      expect(html, relativePath).toContain(expectedLink);
      expect(html, relativePath).not.toContain("mailto:contact@huihui.dev");
    }
  });

  test("all localized contact pages load the shared external module", async () => {
    for (const relativePath of contactPages) {
      const html = await readFile(path.join(root, relativePath), "utf8");

      expect(html, relativePath).toMatch(
        /<script src="(?:\.\.\/|\/)js\/contact\.js"><\/script>/,
      );
      expect(html, relativePath).not.toMatch(
        /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i,
      );
    }
  });

  test("the repository has no inline scripts or HTML event handlers", async () => {
    const htmlFiles = await listFiles(root, ".html");

    for (const filePath of htmlFiles) {
      const html = await readFile(filePath, "utf8");
      const relativePath = path.relative(root, filePath);

      expect(html, relativePath).not.toMatch(
        /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i,
      );
      expect(html, relativePath).not.toMatch(
        /\son[a-z][a-z0-9_-]*\s*=/i,
      );
    }
  });

  test("generated markup contains no inline event handlers", async () => {
    const javaScriptFiles = (
      await Promise.all(
        ["js", "tools"].map((directory) =>
          listFiles(path.join(root, directory), ".js"),
        ),
      )
    ).flat();

    for (const filePath of javaScriptFiles) {
      const source = await readFile(filePath, "utf8");
      const relativePath = path.relative(root, filePath);

      expect(source, relativePath).not.toMatch(
        /\son[a-z][a-z0-9_-]*\s*=\s*["'`]/i,
      );
    }
  });

  test("image fallbacks remain available through programmatic listeners", async () => {
    const source = await readFile(path.join(root, "js/about-page.js"), "utf8");
    let errorListener;
    let listenerOptions;
    const image = {
      dataset: { fallbackSrc: "/images/fallback.webp" },
      removeAttribute(name) {
        if (name === "data-fallback-src") delete this.dataset.fallbackSrc;
      },
      addEventListener(event, listener, options) {
        if (event === "error") {
          errorListener = listener;
          listenerOptions = options;
        }
      },
    };
    const context = {
      document: { addEventListener() {} },
      testRoot: { querySelectorAll: () => [image] },
    };

    vm.createContext(context);
    vm.runInContext(source, context, { filename: "js/about-page.js" });
    vm.runInContext("attachImageFallbacks(testRoot)", context);

    expect(image.dataset.fallbackSrc).toBeUndefined();
    expect(listenerOptions).toEqual({ once: true });

    errorListener();
    expect(image.src).toBe("/images/fallback.webp");
  });

  test("script-src no longer permits unsafe inline JavaScript", async () => {
    const headers = await readFile(path.join(root, "_headers"), "utf8");
    const scriptSrc = headers.match(/script-src\s+([^;]+);/)?.[1] || "";

    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
