import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFile = promisify(execFileCallback);

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

async function listFiles(directory, extension = null) {
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
    } else if (
      entry.isFile() &&
      (extension === null || entry.name.endsWith(extension))
    ) {
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

async function effectiveTextAttribute(filePath, cwd = root) {
  const { stdout } = await execFile(
    "git",
    ["-C", cwd, "check-attr", "text", "--", filePath],
    { encoding: "utf8" },
  );
  const match = stdout.trim().match(/^.+: text: (.+)$/);

  if (!match) {
    throw new Error(`Unexpected git check-attr output for ${filePath}`);
  }

  return match[1];
}

async function gitTrackedEntries(directory, cwd = root) {
  const { stdout } = await execFile(
    "git",
    ["-C", cwd, "ls-files", "--stage", "--", directory],
    { encoding: "utf8" },
  );

  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+\S+\s+\d+\t(.+)$/);

      if (!match) {
        throw new Error(`Unexpected git ls-files --stage output: ${line}`);
      }

      return {
        mode: match[1],
        path: match[2].replaceAll("\\", "/"),
      };
    });
}

async function expectBytePreservation(filePath, cwd = root) {
  const effectiveText = await effectiveTextAttribute(filePath, cwd);
  expect(["unset", "-text"], filePath).toContain(effectiveText);
}

function normalizeManifestPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function packageDirectory(filePath) {
  return filePath.split("/").slice(0, 2).join("/");
}

function assertLicenseCoverage(manifest, trackedVendorFiles) {
  const manifestPackageDirectories = new Set();
  const declaredLicensePaths = [];

  for (const dependency of manifest.dependencies) {
    const dependencyFiles = dependency.files.map((file) =>
      normalizeManifestPath(file.path),
    );
    const dependencyDirectories = new Set(
      dependencyFiles.map((filePath) => packageDirectory(filePath)),
    );

    expect(dependencyDirectories.size, dependency.package).toBe(1);
    const dependencyDirectory = [...dependencyDirectories][0];
    manifestPackageDirectories.add(dependencyDirectory);

    const licensePaths = dependency.files
      .filter((file) => file.role === "license")
      .map((file) => normalizeManifestPath(file.path));

    expect(licensePaths, dependency.package).toHaveLength(1);
    expect(packageDirectory(licensePaths[0]), dependency.package).toBe(
      dependencyDirectory,
    );
    declaredLicensePaths.push(licensePaths[0]);
  }

  expect(new Set(declaredLicensePaths).size).toBe(declaredLicensePaths.length);

  for (const dependencyDirectory of manifestPackageDirectories) {
    const licensePaths = declaredLicensePaths.filter(
      (filePath) => packageDirectory(filePath) === dependencyDirectory,
    );

    expect(licensePaths, dependencyDirectory).toHaveLength(1);
    expect(trackedVendorFiles, licensePaths[0]).toContain(licensePaths[0]);
  }
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
      { package: "overlayscrollbars", version: "2.16.0", license: "MIT" },
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

  test("manifest covers the complete tracked vendor tree", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, "vendor/manifest.json"), "utf8"),
    );
    const manifestFiles = manifest.dependencies.flatMap((dependency) =>
      dependency.files.map((file) => file.path),
    );
    const normalizedManifestFiles = manifestFiles.map((filePath) =>
      normalizeManifestPath(filePath),
    );
    const vendorEntries = await gitTrackedEntries("vendor");
    const vendorFiles = vendorEntries.map((entry) => entry.path);
    const vendorModes = new Map(
      vendorEntries.map((entry) => [entry.path, entry.mode]),
    );
    const allowedDocumentation = new Set([
      "vendor/README.md",
      "vendor/manifest.json",
    ]);
    const trackedVendorFiles = vendorFiles.filter(
      (filePath) => !allowedDocumentation.has(filePath),
    );

    expect(new Set(normalizedManifestFiles).size).toBe(
      normalizedManifestFiles.length,
    );
    expect([...normalizedManifestFiles].sort()).toEqual(
      [...trackedVendorFiles].sort(),
    );

    for (const filePath of normalizedManifestFiles) {
      expect(vendorModes.get(filePath), filePath).toMatch(/^100(?:644|755)$/);
    }

    const packageDirectories = [
      ...new Set(
        trackedVendorFiles.map((filePath) =>
          filePath.split("/").slice(0, 2).join("/"),
        ),
      ),
    ].sort();
    const manifestPackageDirectories = [
      ...new Set(
        normalizedManifestFiles.map((filePath) =>
          filePath.split("/").slice(0, 2).join("/"),
        ),
      ),
    ].sort();

    expect(packageDirectories).toEqual(manifestPackageDirectories);

    assertLicenseCoverage(manifest, trackedVendorFiles);
  });

  test("LICENSE coverage is required for each package directory", () => {
    const validManifest = {
      dependencies: [
        {
          package: "one",
          files: [
            { path: "vendor/one/runtime.js", role: "runtime" },
            { path: "vendor/one/LICENSE", role: "license" },
          ],
        },
        {
          package: "two",
          files: [
            { path: "vendor/two/runtime.js", role: "runtime" },
            { path: "vendor/two/LICENSE", role: "license" },
          ],
        },
      ],
    };
    const validTrackedFiles = [
      "vendor/one/runtime.js",
      "vendor/one/LICENSE",
      "vendor/two/runtime.js",
      "vendor/two/LICENSE",
    ];

    expect(() =>
      assertLicenseCoverage(validManifest, validTrackedFiles),
    ).not.toThrow();

    const missingLicenseManifest = {
      dependencies: [
        validManifest.dependencies[0],
        {
          package: "two",
          files: [{ path: "vendor/two/runtime.js", role: "runtime" }],
        },
      ],
    };

    expect(() =>
      assertLicenseCoverage(missingLicenseManifest, [
        "vendor/one/runtime.js",
        "vendor/one/LICENSE",
        "vendor/two/runtime.js",
      ]),
    ).toThrow();

    const duplicateAndMissingManifest = {
      dependencies: [
        {
          package: "one",
          files: [
            { path: "vendor/one/runtime.js", role: "runtime" },
            { path: "vendor/one/LICENSE", role: "license" },
            { path: "vendor/one/LICENSE.copy", role: "license" },
          ],
        },
        missingLicenseManifest.dependencies[1],
      ],
    };

    expect(() =>
      assertLicenseCoverage(duplicateAndMissingManifest, [
        "vendor/one/runtime.js",
        "vendor/one/LICENSE",
        "vendor/one/LICENSE.copy",
        "vendor/two/runtime.js",
      ]),
    ).toThrow();
  });

  test("tracked vendor inventory includes symlink entries and ignores untracked files", async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "vendor-index-"));

    try {
      await mkdir(path.join(fixtureRoot, "vendor"), { recursive: true });
      await execFile("git", ["init", "--quiet", fixtureRoot]);
      await writeFile(path.join(fixtureRoot, "vendor/runtime.js"), "runtime\n");
      await writeFile(path.join(fixtureRoot, "vendor/target"), "target\n");
      await writeFile(
        path.join(fixtureRoot, "vendor/untracked.js"),
        "untracked\n",
      );
      await execFile("git", ["-C", fixtureRoot, "add", "--", "vendor/runtime.js"]);
      const { stdout: objectId } = await execFile(
        "git",
        ["-C", fixtureRoot, "hash-object", "-w", "vendor/target"],
        { encoding: "utf8" },
      );
      await execFile("git", [
        "-C",
        fixtureRoot,
        "update-index",
        "--add",
        "--cacheinfo",
        `120000,${objectId.trim()},vendor/tracked-link`,
      ]);

      const trackedEntries = await gitTrackedEntries("vendor", fixtureRoot);

      expect(trackedEntries.map((entry) => entry.path)).toEqual([
        "vendor/runtime.js",
        "vendor/tracked-link",
      ]);
      expect(
        trackedEntries.find((entry) => entry.path === "vendor/runtime.js")?.mode,
      ).toMatch(/^100(?:644|755)$/);
      expect(
        trackedEntries.find((entry) => entry.path === "vendor/tracked-link")?.mode,
      ).toBe("120000");
      expect(
        trackedEntries.some((entry) => entry.path === "vendor/untracked.js"),
      ).toBe(false);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("manifest vendor files have effective byte-preservation attributes", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, "vendor/manifest.json"), "utf8"),
    );
    const manifestFiles = manifest.dependencies.flatMap((dependency) =>
      dependency.files.map((file) => file.path.split(path.sep).join("/")),
    );
    for (const filePath of manifestFiles) {
      await expectBytePreservation(filePath);
    }
  });

  test("effective attributes reject a later text normalization rule", async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "vendor-attrs-"));

    try {
      await mkdir(path.join(fixtureRoot, "vendor"), { recursive: true });
      await writeFile(
        path.join(fixtureRoot, ".gitattributes"),
        "vendor/LICENSE -text\n* text=auto\n",
      );
      await writeFile(path.join(fixtureRoot, "vendor/LICENSE"), "license\n");
      await execFile("git", ["init", "--quiet", fixtureRoot]);

      await expect(
        expectBytePreservation("vendor/LICENSE", fixtureRoot),
      ).rejects.toThrow();
      await expect(effectiveTextAttribute("vendor/LICENSE", fixtureRoot)).resolves.toBe(
        "auto",
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
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
      "https://huihui-api-beta.huihuigames01.workers.dev",
    ]);
    expect(connectSources).not.toContain(
      "https://huihui-api.huihuigames01.workers.dev",
    );
    expect(headers).not.toContain(removedRuntimeCdn);
    expect(headers).not.toContain("'unsafe-eval'");
    expect([
      ...scriptSources,
      ...styleSources,
      ...connectSources,
    ]).not.toContain("*");
  });
});
