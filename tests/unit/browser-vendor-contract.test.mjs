import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const aboutPages = [
  "about/index.html",
  "en/about/index.html",
  "ja/about/index.html",
];
const allowedExternalScripts = new Set([
  "https://challenges.cloudflare.com/turnstile/v0/api.js",
]);
const removedRuntimeCdn = ["cdn", "jsdelivr", "net"].join(".");

async function listFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (
      [".git", "node_modules", "playwright-report", "test-results"].includes(
        entry.name,
      )
    ) {
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

function getAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? null;
}

function getTags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map(
    (match) => match[0],
  );
}

function getCspSources(headers, directive) {
  const value = headers.match(new RegExp(`${directive}\\s+([^;]+);`))?.[1];
  return value?.trim().split(/\s+/) || [];
}

function sha256Bytes(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError("SHA-256 input must be raw Buffer bytes");
  }

  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256(filePath) {
  return sha256Bytes(await readFile(filePath));
}

describe("vendored browser dependencies", () => {
  test("raw-byte checksums reject LF and CRLF variants", () => {
    const lfFixture = Buffer.from("first line\nsecond line\n", "utf8");
    const crlfFixture = Buffer.from("first line\r\nsecond line\r\n", "utf8");
    const expectedSha256 = sha256Bytes(lfFixture);

    expect(sha256Bytes(lfFixture)).toBe(expectedSha256);
    expect(sha256Bytes(crlfFixture)).not.toBe(expectedSha256);
  });

  test("manifest files exist and match their recorded SHA-256 checksums", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, "vendor/manifest.json"), "utf8"),
    );

    expect(
      manifest.dependencies.map((dependency) => ({
        package: dependency.package,
        version: dependency.version,
        license: dependency.license,
      })),
    ).toEqual([
      { package: "prismjs", version: "1.30.0", license: "MIT" },
      { package: "html2canvas", version: "1.4.1", license: "MIT" },
    ]);

    for (const dependency of manifest.dependencies) {
      expect(dependency.source).toMatch(
        /^https:\/\/registry\.npmjs\.org\//,
      );
      expect(dependency.repository).toMatch(/^https:\/\/github\.com\//);
      expect(dependency.sourceSha256).toMatch(/^[a-f0-9]{64}$/);

      for (const file of dependency.files) {
        const filePath = path.resolve(root, file.path);

        expect(filePath.startsWith(`${root}${path.sep}`), file.path).toBe(true);
        expect(await sha256(filePath), file.path).toBe(file.sha256);
      }
    }
  });

  test("localized About pages load only the required Prism files in order", async () => {
    const aboutSource = await readFile(path.join(root, "js/about-page.js"), "utf8");
    const languageClasses = [
      ...new Set(aboutSource.match(/language-[a-z0-9_-]+/gi) || []),
    ];

    expect(languageClasses).toEqual(["language-python"]);

    for (const relativePath of aboutPages) {
      const html = await readFile(path.join(root, relativePath), "utf8");
      const styles = getTags(html, "link")
        .filter((tag) => getAttribute(tag, "rel") === "stylesheet")
        .map((tag) => getAttribute(tag, "href"));
      const scripts = getTags(html, "script").map((tag) =>
        getAttribute(tag, "src"),
      );

      expect(styles).toContain("/vendor/prism/themes/prism-tomorrow.min.css");
      expect(styles).toContain(
        "/vendor/prism/plugins/line-numbers/prism-line-numbers.min.css",
      );
      expect(
        styles.indexOf("/vendor/prism/themes/prism-tomorrow.min.css"),
      ).toBeLessThan(
        styles.indexOf(
          "/vendor/prism/plugins/line-numbers/prism-line-numbers.min.css",
        ),
      );
      expect(scripts.slice(0, 3), relativePath).toEqual([
        "/vendor/prism/components/prism-core.min.js",
        "/vendor/prism/components/prism-python.min.js",
        "/vendor/prism/plugins/line-numbers/prism-line-numbers.min.js",
      ]);
      expect(
        scripts.findIndex((src) => src?.endsWith("/js/code-blocks.js")),
      ).toBeGreaterThan(2);
    }
  });

  test("runtime HTML and dynamic imports have no unapproved executable CDN URLs", async () => {
    const htmlFiles = await listFiles(root, ".html");
    const externalScripts = [];
    const externalStyles = [];

    for (const filePath of htmlFiles) {
      const html = await readFile(filePath, "utf8");
      const relativePath = path.relative(root, filePath);

      for (const tag of getTags(html, "script")) {
        const src = getAttribute(tag, "src");
        if (/^https?:\/\//i.test(src || "")) {
          externalScripts.push({ relativePath, url: src });
        }
      }

      for (const tag of getTags(html, "link")) {
        const href = getAttribute(tag, "href");
        if (
          getAttribute(tag, "rel") === "stylesheet" &&
          /^https?:\/\//i.test(href || "")
        ) {
          externalStyles.push({ relativePath, url: href });
        }
      }
    }

    expect(externalStyles).toEqual([]);
    expect(externalScripts.length).toBeGreaterThan(0);
    for (const script of externalScripts) {
      expect(allowedExternalScripts.has(script.url), script.relativePath).toBe(
        true,
      );
    }

    const browserJavaScriptFiles = (
      await Promise.all(
        ["js", "tools"].map((directory) =>
          listFiles(path.join(root, directory), ".js"),
        ),
      )
    ).flat();

    for (const filePath of browserJavaScriptFiles) {
      const source = await readFile(filePath, "utf8");
      expect(source, path.relative(root, filePath)).not.toMatch(
        /\bimport\s*\(\s*["']https?:\/\//i,
      );
    }

    const tierMakerSource = await readFile(
      path.join(root, "tools/tier-maker/script.js"),
      "utf8",
    );
    expect(tierMakerSource).toMatch(
      /import\(\s*"\/vendor\/html2canvas\/html2canvas\.esm\.js"\s*\)/,
    );
  });

  test("CSP permits only the required browser runtime sources", async () => {
    const headers = await readFile(path.join(root, "_headers"), "utf8");
    const scriptSources = getCspSources(headers, "script-src");
    const styleSources = getCspSources(headers, "style-src");
    const connectSources = getCspSources(headers, "connect-src");

    expect(getCspSources(headers, "default-src")).toEqual(["'self'"]);
    expect(scriptSources).toEqual([
      "'self'",
      "https://challenges.cloudflare.com",
      "https://static.cloudflareinsights.com",
    ]);
    expect(styleSources).toEqual(["'self'", "'unsafe-inline'"]);
    expect(connectSources).toEqual([
      "'self'",
      "https://api.huihui.dev",
      "https://huihui-api.huihuigames01.workers.dev",
      "https://huihui-api-beta.huihuigames01.workers.dev",
    ]);
    expect(headers).not.toContain(removedRuntimeCdn);
    expect(headers).not.toContain("'unsafe-eval'");
    expect([
      ...scriptSources,
      ...styleSources,
      ...connectSources,
    ]).not.toContain("*");
  });
});
