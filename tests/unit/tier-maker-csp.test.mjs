import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("production CSP allows only the required Tier Maker image sources", async () => {
  const headers = await readFile(path.join(root, "_headers"), "utf8");
  const imageSources = headers.match(/img-src\s+([^;]+);/)?.[1].trim().split(/\s+/);

  expect(imageSources).toEqual(["'self'", "data:", "https:", "blob:"]);
});
