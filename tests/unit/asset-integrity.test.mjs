import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const root = process.cwd();
const productionScriptRoots = ["js", "tools", "workers"];
const imageReferencePattern =
  /(?<![/:\w])\/?images\/[^"'`\s?#)]+?\.(?:avif|gif|jpe?g|png|svg|webp)/gi;

let imageFiles;
let scriptSources;

async function listFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules") continue;

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath, extension)));
    } else if (!extension || entry.name.endsWith(extension)) {
      files.push(entryPath);
    }
  }

  return files;
}

function toRepositoryPath(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function extractLocalImageReferences(source) {
  return [...source.matchAll(imageReferencePattern)].map((match) => match[0]);
}

function expectImageReferenceToExist(reference, sourceFile) {
  expect(reference, `${sourceFile}: ${reference}`).toMatch(/^\/images\//);
  expect(
    imageFiles.has(reference.slice(1)),
    `${sourceFile}: ${reference}`,
  ).toBe(true);
}

beforeAll(async () => {
  const imagePaths = await listFiles(path.join(root, "images"));
  imageFiles = new Set(imagePaths.map(toRepositoryPath));

  const scriptPaths = (
    await Promise.all(
      productionScriptRoots.map((directory) =>
        listFiles(path.join(root, directory), ".js"),
      ),
    )
  ).flat();

  scriptSources = new Map(
    await Promise.all(
      scriptPaths.map(async (filePath) => [
        toRepositoryPath(filePath),
        await readFile(filePath, "utf8"),
      ]),
    ),
  );
});

describe("local image asset integrity", () => {
  test("all production JavaScript image literals are root-absolute and exist", () => {
    const references = [];

    for (const [sourceFile, source] of scriptSources) {
      for (const reference of extractLocalImageReferences(source)) {
        references.push(reference);
        expectImageReferenceToExist(reference, sourceFile);
      }
    }

    expect(references.length).toBeGreaterThan(0);
  });

  test("About and Worker APOD fallback references resolve to local files", () => {
    const aboutSource = scriptSources.get("js/about-page.js");
    const workerSource = scriptSources.get("workers/huihui-api/worker.js");
    const aboutFallbacks = [
      ...aboutSource.matchAll(/data-fallback-src="([^"]+)"/g),
    ]
      .map((match) => match[1])
      .filter((reference) => reference.startsWith("/images/"));
    const workerFallback = workerSource.match(
      /function getFallbackApod\(\)[\s\S]*?imageUrl:\s*"([^"]+)"/,
    )?.[1];

    expect(aboutFallbacks).toEqual([
      "/images/1001_am.webp",
      "/images/1001_am.webp",
      "/images/1032_a.webp",
      "/images/1032_a.webp",
      "/images/1032_a.webp",
    ]);
    expect(workerFallback).toBe("/images/0001_hp.webp");

    for (const reference of new Set([
      ...aboutFallbacks,
      workerFallback,
    ])) {
      expectImageReferenceToExist(reference, "fallback references");
    }
  });
});
